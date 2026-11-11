import { Logger } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { extraerAreasNativas, AreaNativa } from './contratacion-areas';
import { ClienteClaude, ClienteClaudeHttp, ErrorClaude } from './contratacion-claude.client';
import { extraerProceso } from './contratacion-clasificador';
import { tipoPorSegmento } from './contratacion-identificadores';
import {
  CATEGORIA_POR_ETAPA, ESQUEMA_RESULTADO, EXTRACTOR_VERSION, depurarResultado, Extraccion, Fragmento, construirSolicitud, estimarTokens, huellaContenido, necesitaInterpretacion,
  seleccionarFragmentos, validarRespuesta,
} from './contratacion-ia';
import { extraerCierreOcr, fusionarCierreOcr, fusionarPresupuestoNativo } from './contratacion-presupuesto-nativo';
import { EjecutorOcr, MIN_TEXTO_NATIVO, MOTOR_OCR, OcrLocal } from './contratacion-ocr';
import { normalizar } from './contratacion-sugerencias';
import { extraerNativo } from './contratacion-nativo';
import { leerTablas } from './contratacion-excel';
import { leerCotizacionExcel } from './contratacion-cotizacion-excel';
import { textoDeSolicitud, verificarPrivacidad, HallazgoPrivacidad } from './contratacion-privacidad';
import {
  claudeApiKey, claudeAutomatico, claudeMaxDocsEjecucion, claudeMaxLlamadasDia, claudeMaxTokensEntrada, claudeMaxTokensSalida, claudeModelo, claudeTarifaUsd, ocrMaxPaginasIa,
} from './contratacion.config';

const MAX_PAGINAS_LECTURA = 150;
/** Identificador del lector nativo de cotizaciones en Excel (no usa la API); versiona sus resultados aparte de los de la lectura asistida. */
export const EXTRACTOR_XLSX = 'xlsx-3';
/** Documentos de nivel edificio: una resolución de demolición o una visita técnica pertenece a un edificio, no a un proceso; no necesitan número de proceso. */
const NIVEL_EDIFICIO = new Set(['RESOLUCION_DEMOLICION', 'VISITA_SOPORTE_TECNICO']);
const BLOQUEO_PRESUPUESTO = 7102; // pg_advisory_xact_lock: serializa la reserva de llamadas entre procesos

export interface LecturaPdf {
  /** Texto nativo de las primeras páginas (índice 0 = página 1). */
  paginas(md5: string, max: number): Promise<string[] | null>;
  bytes(md5: string): Promise<Buffer | null>;
}

export interface ResumenIa {
  revisadas: number; nativas: number; desde_cache: number; llamadas: number; pendientes: number; errores: number;
  ocr_paginas: number; tokens_entrada: number; tokens_salida: number; limite_alcanzado: boolean; detenido: string | null;
  bloqueadas: number; reutilizadas: number; pdf_leidos: number; excel_leidos: number;
  /** Solo en simulación: qué haría cada versión y la verificación de privacidad del texto exacto que saldría. */
  simulacion?: Array<{ version_id: number; accion: string; paginas_enviadas: number[]; caracteres: number; tokens_estimados: number; hallazgos: HallazgoPrivacidad[] }>;
}

const hoy = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

/** Cola de un solo carril: nunca hay dos solicitudes a la API al mismo tiempo en este proceso. */
class Carril {
  private cola: Promise<unknown> = Promise.resolve();
  ejecutar<T>(f: () => Promise<T>): Promise<T> {
    const r = this.cola.then(f, f);
    this.cola = r.catch(() => undefined);
    return r;
  }
}

/**
 * Lectura asistida de documentos: nativa primero, OCR solo de las páginas sin texto y únicamente si hace falta, y Claude solo para lo
 * que sigue ambiguo. Cada versión se procesa una vez por versión del extractor (caché persistente) y el mismo contenido reutiliza el
 * resultado. Todo dato aceptado conserva página y cita validadas en el servidor; las asociaciones confirmadas por una persona no se tocan.
 */
export class ContratacionIaService {
  private readonly log = new Logger(ContratacionIaService.name);
  private readonly carril = new Carril();
  private enCurso = false;
  private simulando = false;
  private simulacion: NonNullable<ResumenIa['simulacion']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cliente: ClienteClaude = new ClienteClaudeHttp(),
    private readonly ocr: EjecutorOcr = new OcrLocal(),
  ) {}

  // ------------------------------------------------------------------ consumo
  /** Reserva una llamada del día de forma atómica. null si el límite diario ya está agotado. */
  private async reservar(versionId: number, modelo: string): Promise<number | null> {
    const max = claudeMaxLlamadasDia();
    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BLOQUEO_PRESUPUESTO})`);
      const usadas = await tx.contratacionIaLlamada.count({ where: { dia: hoy() } });
      if (usadas >= max) return null;
      const f = await tx.contratacionIaLlamada.create({ data: { dia: hoy(), version_id: versionId, modelo, estado: 'RESERVADA' } });
      return f.id as number;
    });
  }

  private costo(ent: number, sal: number): number | null {
    const t = claudeTarifaUsd();
    return t ? (ent * t.entrada + sal * t.salida) / 1_000_000 : null;
  }

  async estado() {
    const [llamadas, extracciones] = await Promise.all([
      this.prisma.contratacionIaLlamada.findMany({ where: { dia: hoy() }, select: { estado: true, tokens_entrada: true, tokens_salida: true, costo_usd: true } }),
      this.prisma.contratacionIaExtraccion.groupBy({ by: ['estado'], where: { extractor: EXTRACTOR_VERSION }, _count: { _all: true } }),
    ]);
    const por = Object.fromEntries(extracciones.map((e) => [e.estado, e._count._all]));
    const costos = llamadas.filter((l) => l.costo_usd !== null);
    return {
      configurado: claudeApiKey() !== null && claudeMaxLlamadasDia() > 0,
      modelo: claudeModelo(),
      extractor: EXTRACTOR_VERSION,
      limite_llamadas_dia: claudeMaxLlamadasDia(),
      hoy: {
        llamadas: llamadas.length,
        tokens_entrada: llamadas.reduce((a, l) => a + l.tokens_entrada, 0),
        tokens_salida: llamadas.reduce((a, l) => a + l.tokens_salida, 0),
        costo_usd_estimado: costos.length ? costos.reduce((a, l) => a + Number(l.costo_usd), 0) : null,
      },
      documentos: { leidos_sin_api: por.NATIVO ?? 0, interpretados: por.OK ?? 0, pendientes: por.PENDIENTE_IA ?? 0, con_error: por.ERROR ?? 0 },
    };
  }

  // ------------------------------------------------------------------ procesamiento
  /** `opciones.versiones`: ejecución MANUAL sobre versiones concretas (no depende del interruptor automático). `forzar`: interpreta aunque la lectura nativa ya resuelva (para medir precisión). */
  async procesar(lectura: LecturaPdf, opciones: { versiones?: number[]; forzar?: boolean; simular?: boolean } = {}): Promise<ResumenIa> {
    const r: ResumenIa = { revisadas: 0, nativas: 0, desde_cache: 0, llamadas: 0, pendientes: 0, errores: 0, ocr_paginas: 0, tokens_entrada: 0, tokens_salida: 0, limite_alcanzado: false, detenido: null, bloqueadas: 0, reutilizadas: 0, pdf_leidos: 0, excel_leidos: 0, ...(opciones.simular ? { simulacion: [] } : {}) };
    if (this.enCurso) return r; // un solo procesamiento a la vez (actualización manual y sincronización automática no se pisan)
    this.enCurso = true;
    try {
      const manual = Array.isArray(opciones.versiones);
      // En simulación nunca se llama a la API ni se escribe nada: solo se muestra qué saldría y si pasa la barrera de privacidad.
      const puedeLlamar = !opciones.simular && this.cliente.disponible() && claudeMaxLlamadasDia() > 0 && (manual || claudeAutomatico());
      this.simulando = !!opciones.simular;
      this.simulacion = r.simulacion ?? null;
      const ahora = new Date();
      const vistas = await this.prisma.contratacionIaExtraccion.findMany({ where: { extractor: EXTRACTOR_VERSION }, select: { version_id: true, estado: true, proximo_intento: true } });
      const hechas = new Set(vistas.filter((v) => manual ? v.estado === 'OK' : v.estado === 'NATIVO' || v.estado === 'OK' || v.estado === 'BLOQUEADA_PRIVACIDAD' || (v.estado === 'PENDIENTE_IA' && !puedeLlamar) || (v.estado === 'ERROR' && v.proximo_intento && v.proximo_intento > ahora)).map((v) => v.version_id));
      const versiones = await this.prisma.contratacionDocumentoVersion.findMany({
        where: {
          vigente: true,
          id: manual ? { in: opciones.versiones!.filter((i) => !hechas.has(i)) } : { notIn: [...hechas] },
          origenes: { some: { estado: 'ACTIVO', mime: 'application/pdf' } },
          indice: { isNot: null },
          documento: { categoria: { not: 'MATRIZ_CONTRATACION' } },
        },
        include: { documento: { include: { edificios: true, sugerencias: { select: { tipo: true, estado: true } }, expediente: { select: { edificios: { select: { edificio_id: true } } } } } }, doc_contrato: { select: { estado: true, proceso_citado: true } } },
        orderBy: { id: 'asc' },
        take: 300,
      });
      if (!opciones.simular) r.excel_leidos = await this.procesarExcel(lectura, manual ? opciones.versiones! : null);
      let llamadasEnEstaEjecucion = 0;
      for (const v of versiones) {
        if (r.detenido) break;
        r.revisadas++;
        try {
          await this.una(v, lectura, puedeLlamar, r, () => llamadasEnEstaEjecucion++, llamadasEnEstaEjecucion, !!opciones.forzar);
        } catch (e) {
          r.errores++;
          this.log.warn(`Sin lectura asistida de una versión: ${(e as Error).message}`);
        }
      }
      if (r.llamadas || r.pendientes || r.errores) {
        this.log.log(`Lectura asistida: ${r.revisadas} revisadas; ${r.nativas} sin API; ${r.desde_cache} desde caché; ${r.llamadas} llamadas (${r.tokens_entrada} tokens de entrada, ${r.tokens_salida} de salida); OCR ${r.ocr_paginas} páginas; pendientes ${r.pendientes}; errores ${r.errores}`);
      }
    } finally {
      this.enCurso = false;
    }
    return r;
  }

  /** Cotizaciones en Excel: lectura directa por hojas y celdas, sin OCR ni API. Una vez por versión del archivo. */
  private async procesarExcel(lectura: LecturaPdf, soloVersiones: number[] | null): Promise<number> {
    let leidos = 0;
    const hechas = await this.prisma.contratacionIaExtraccion.findMany({ where: { extractor: EXTRACTOR_XLSX }, select: { version_id: true } });
    const vs = await this.prisma.contratacionDocumentoVersion.findMany({
      where: { vigente: true, id: { notIn: hechas.map((h) => h.version_id), ...(soloVersiones ? { in: soloVersiones } : {}) }, origenes: { some: { estado: 'ACTIVO', mime: { contains: 'spreadsheetml' } } }, documento: { categoria: 'COTIZACIONES' } },
      select: { id: true, md5: true },
    });
    for (const v of vs) {
      try {
        const buf = await lectura.bytes(v.md5);
        if (!buf) continue;
        const c = leerCotizacionExcel(await leerTablas(buf));
        const no_encontrados = c.aplica ? ['edificio', 'proveedor', 'numero_cotizacion', 'fecha_cotizacion', 'importe'].filter((k) => !c.campos[k]).map((k) => ({ campo: k, motivo: 'no consta en la hoja' })) : [{ campo: 'cotizacion', motivo: c.motivo ?? 'plantilla no reconocida' }];
        const resultado = { hoja_calculo: true, esquema: ESQUEMA_RESULTADO, trazabilidad: { extractor: EXTRACTOR_XLSX, origen: 'HOJA_DE_CALCULO' }, aplica: c.aplica, hoja: c.hoja ?? null, campos: c.campos, partidas: c.partidas, controles_aritmeticos: c.controles_aritmeticos, hojas_adicionales: c.hojas_adicionales, no_encontrados };
        await this.prisma.contratacionIaExtraccion.upsert({
          where: { version_id_extractor: { version_id: v.id, extractor: EXTRACTOR_XLSX } },
          create: { version_id: v.id, extractor: EXTRACTOR_XLSX, estado: c.aplica ? 'OK' : 'NO_APLICA', resultado: resultado as any },
          update: { estado: c.aplica ? 'OK' : 'NO_APLICA', resultado: resultado as any },
        });
        leidos++;
      } catch (e) {
        this.log.warn(`Sin lectura de una cotización en Excel: ${(e as Error).message}`);
      }
    }
    return leidos;
  }

  /**
   * Completa, SIN llamar a la API, el desglose de lecturas ya aceptadas (OK) cuyo presupuesto se puede leer del texto nativo con controles aritméticos.
   * No toca filas sin lectura previa ni cambia campos, descartes ni valores ya verificados.
   */
  async completarDesgloseNativo(lectura: LecturaPdf, versiones: number[]): Promise<Array<{ version_id: number; aplicado: boolean; motivo?: string; partidas?: number }>> {
    const out: Array<{ version_id: number; aplicado: boolean; motivo?: string; partidas?: number }> = [];
    for (const id of versiones) {
      const fila = await this.prisma.contratacionIaExtraccion.findUnique({ where: { version_id_extractor: { version_id: id, extractor: EXTRACTOR_VERSION } }, include: { version: { select: { md5: true } } } });
      if (!fila || fila.estado !== 'OK' || !fila.resultado) { out.push({ version_id: id, aplicado: false, motivo: 'sin lectura aceptada (OK) del extractor vigente' }); continue; }
      const nativas = (await lectura.paginas(fila.version.md5, MAX_PAGINAS_LECTURA)) ?? [];
      const guardadas = await this.prisma.contratacionOcrPagina.findMany({ where: { version_id: id }, select: { pagina: true, texto: true } });
      const porOcr = new Map(guardadas.map((g) => [g.pagina, g.texto]));
      const paginas = nativas.map((texto, i) => ({ pagina: i + 1, texto: texto.trim().length < MIN_TEXTO_NATIVO && porOcr.has(i + 1) ? porOcr.get(i + 1)! : texto }));
      const f = fusionarPresupuestoNativo(fila.resultado as any, paginas);
      if (!f.aplicado) { out.push({ version_id: id, aplicado: false, motivo: f.motivo }); continue; }
      await this.prisma.contratacionIaExtraccion.update({ where: { id: fila.id }, data: { resultado: f.resultado as any } });
      out.push({ version_id: id, aplicado: true, partidas: (f.resultado as any).partidas.length });
    }
    return out;
  }

  /**
   * OCR local selectivo de UNA página (el cierre de una oferta cuya tabla es una imagen). Guarda el texto OCR de esa página como evidencia y, solo si las
   * operaciones aritméticas del cierre cuadran, lo incorpora a la lectura aceptada. Sin llamadas a la API; no toca valores verificados ni otras páginas.
   */
  async completarCierreOcr(versionId: number, pagina: number, pdf: Buffer): Promise<{ version_id: number; aplicado: boolean; motivo?: string; centavos?: boolean }> {
    if (!this.ocr.disponible()) return { version_id: versionId, aplicado: false, motivo: 'OCR local no disponible' };
    const fila = await this.prisma.contratacionIaExtraccion.findUnique({ where: { version_id_extractor: { version_id: versionId, extractor: EXTRACTOR_VERSION } } });
    if (!fila || fila.estado !== 'OK' || !fila.resultado) return { version_id: versionId, aplicado: false, motivo: 'sin lectura aceptada (OK) del extractor vigente' };
    const texto = this.ocr.paginas(pdf, [pagina])[0] ?? '';
    if (!texto) return { version_id: versionId, aplicado: false, motivo: 'el OCR no devolvió texto' };
    await this.prisma.contratacionOcrPagina.upsert({
      where: { version_id_pagina: { version_id: versionId, pagina } },
      create: { version_id: versionId, pagina, texto, motor: MOTOR_OCR }, update: { texto, motor: MOTOR_OCR },
    });
    const cierre = extraerCierreOcr(texto, pagina);
    if (cierre.ok === false) return { version_id: versionId, aplicado: false, motivo: cierre.motivo };
    const res: any = fusionarCierreOcr(fila.resultado as any, cierre, pagina);
    await this.prisma.contratacionIaExtraccion.update({ where: { id: fila.id }, data: { resultado: res } });
    return { version_id: versionId, aplicado: true, centavos: res.partidas.some((p: any) => p.importe_en_el_texto !== undefined) };
  }

  private async guardarFila(versionId: number, datos: Record<string, any>) {
    // Una lectura ya completada (OK) nunca se degrada a NATIVO o PENDIENTE_IA: otro proceso (la actualización automática del servidor) pudo listarla
    // como pendiente antes de que una ejecución manual la terminara.
    if (this.simulando) return;
    if (datos.estado === 'PENDIENTE_IA' || datos.estado === 'NATIVO') {
      const actual = await this.prisma.contratacionIaExtraccion.findUnique({ where: { version_id_extractor: { version_id: versionId, extractor: EXTRACTOR_VERSION } }, select: { estado: true } });
      if (actual?.estado === 'OK') return;
    }
    await this.prisma.contratacionIaExtraccion.upsert({
      where: { version_id_extractor: { version_id: versionId, extractor: EXTRACTOR_VERSION } },
      create: { version_id: versionId, extractor: EXTRACTOR_VERSION, estado: 'PENDIENTE_IA', ...datos },
      update: datos,
    });
  }

  private async una(v: any, lectura: LecturaPdf, puedeLlamar: boolean, r: ResumenIa, contarLlamada: () => void, llamadasPrevias: number, forzar = false) {
    const doc = v.documento;
    const nombre: string = doc.nombre ?? '';
    if (/transcrip/i.test(nombre)) { await this.guardarFila(v.id, { estado: 'NATIVO' }); r.nativas++; return; }

    // 1) Lectura nativa (y OCR ya guardado, que no cuesta nada).
    const nativas = (await lectura.paginas(v.md5, MAX_PAGINAS_LECTURA)) ?? [];
    r.pdf_leidos++;
    let paginas: Fragmento[] = nativas.map((texto, i) => ({ pagina: i + 1, texto }));
    const guardadas = await this.prisma.contratacionOcrPagina.findMany({ where: { version_id: v.id }, select: { pagina: true, texto: true } });
    const porOcr = new Map(guardadas.map((g) => [g.pagina, g.texto]));
    paginas = paginas.map((p) => (p.texto.trim().length < MIN_TEXTO_NATIVO && porOcr.has(p.pagina) ? { pagina: p.pagina, texto: porOcr.get(p.pagina)! } : p));

    const edificiosDoc: number[] = doc.edificios.map((e: any) => e.edificio_id);
    const evaluar = (ps: Fragmento[]) => {
      const texto = ps.map((p) => p.texto).join(' ');
      return {
        textoUtil: ps.some((p) => p.texto.trim().length >= MIN_TEXTO_NATIVO),
        // Un contrato solo deja resuelto el proceso si cita su número de proceso (.32.) o ya está asociado a un expediente; el número de contrato no basta.
        procesoResuelto: !!(NIVEL_EDIFICIO.has(doc.categoria) || doc.expediente_id || (doc.proceso_detectado && tipoPorSegmento(doc.proceso_detectado) === 'PROCESO') || v.doc_contrato?.proceso_citado || extraerProceso(texto)),
        edificioResuelto: edificiosDoc.length > 0 || (doc.expediente?.edificios?.length ?? 0) > 0 || doc.sugerencias.some((s: any) => s.tipo === 'EDIFICACION' && s.estado !== 'DESCARTADA'),
      };
    };
    let est = evaluar(paginas);
    const nativoNecesita = (e: ReturnType<typeof evaluar>) => (forzar && e.textoUtil) || necesitaInterpretacion({ esMatriz: false, esTranscripcion: false, ...e });

    // 2) OCR selectivo: solo si, con el texto nativo, falta algo y la interpretación podrá usarse; solo páginas sin texto, con tope.
    const sinTexto = paginas.filter((p) => p.texto.trim().length < MIN_TEXTO_NATIVO).map((p) => p.pagina);
    if ((nativoNecesita(est) || !est.textoUtil) && puedeLlamar && sinTexto.length && ocrMaxPaginasIa() > 0 && this.ocr.disponible()) {
      const piden = sinTexto.slice(0, ocrMaxPaginasIa());
      const bytes = await lectura.bytes(v.md5);
      if (bytes) {
        const textos = this.ocr.paginas(bytes, piden);
        for (let i = 0; i < piden.length; i++) {
          if (!textos[i]) continue;
          await this.prisma.contratacionOcrPagina.upsert({
            where: { version_id_pagina: { version_id: v.id, pagina: piden[i] } },
            create: { version_id: v.id, pagina: piden[i], texto: textos[i], motor: MOTOR_OCR },
            update: { texto: textos[i], motor: MOTOR_OCR },
          });
          paginas = paginas.map((p) => (p.pagina === piden[i] ? { pagina: p.pagina, texto: textos[i] } : p));
          r.ocr_paginas++;
        }
        est = evaluar(paginas);
      }
    }

    // 3) Superficies declaradas de forma expresa (sin API).
    if (!this.simulando) await this.registrarAreas(v, edificiosDoc, extraerAreasNativas(paginas).map((a) => ({ ...a, edificio: null as string | null })), 'NATIVO', null);

    // La clasificación (edificio y proceso ya resueltos) NO demuestra que se hayan extraído los datos útiles del documento: se extraen de forma nativa y
    // se deja constancia de lo hallado y de lo que el extractor no encontró.
    if (!nativoNecesita(est)) {
      const nat = extraerNativo(paginas, doc.categoria);
      const resultado = depurarResultado({ nativo: true, esquema: ESQUEMA_RESULTADO, trazabilidad: { extractor: EXTRACTOR_VERSION, origen: 'NATIVO' }, campos: nat.campos, areas: [], partidas: [], no_encontrados: nat.no_encontrados });
      await this.guardarFila(v.id, { estado: 'NATIVO', paginas_ocr: 0, resultado: resultado as any });
      this.anotar(v.id, 'NATIVO', [], 0, []);
      r.nativas++;
      return;
    }

    // Un resultado ya verificado de otra versión del extractor, con el esquema vigente, se reutiliza: cambiar los filtros no obliga a repetir la llamada.
    const anterior = await this.prisma.contratacionIaExtraccion.findFirst({ where: { version_id: v.id, estado: 'OK', extractor: { not: EXTRACTOR_VERSION } }, orderBy: { id: 'desc' } });
    const prev: any = anterior?.resultado;
    if (anterior && prev && Array.isArray(prev.partidas) && !forzar) {
      const limpio: any = depurarResultado(prev);
      if (verificarPrivacidad(JSON.stringify(limpio)).length === 0) {
        this.anotar(v.id, 'REUTILIZARIA', [], 0, []);
        if (!this.simulando) {
          limpio.esquema = ESQUEMA_RESULTADO;
          limpio.trazabilidad = { ...(limpio.trazabilidad ?? {}), reutilizado_de: anterior.extractor, modelo: anterior.modelo, extractor_vigente: EXTRACTOR_VERSION };
          await this.aplicar(v, doc, limpio, edificiosDoc);
          await this.guardarFila(v.id, { estado: 'OK', huella: anterior.huella, modelo: anterior.modelo, resultado: limpio, descartes: anterior.descartes as any, tokens_entrada: 0, tokens_salida: 0 });
        }
        r.reutilizadas++;
        return;
      }
    }
    if (!puedeLlamar && !this.simulando) { await this.guardarFila(v.id, { estado: 'PENDIENTE_IA' }); r.pendientes++; return; }

    // 4) Interpretación con la API, con caché por contenido.
    const fragmentos = seleccionarFragmentos(paginas, claudeMaxTokensEntrada());
    if (fragmentos.length === 0) { await this.guardarFila(v.id, { estado: 'NATIVO' }); r.nativas++; return; }
    const solicitudPrevia = construirSolicitud(fragmentos, claudeMaxTokensSalida());
    // Barrera de privacidad sobre el texto EXACTO de la solicitud, después de todas las transformaciones. Si detecta algo, no se envía.
    const hallazgos = verificarPrivacidad(textoDeSolicitud(solicitudPrevia));
    this.anotar(v.id, hallazgos.length ? 'BLOQUEARIA_PRIVACIDAD' : 'LLAMARIA_API', fragmentos.map((f) => f.pagina), textoDeSolicitud(solicitudPrevia).length, hallazgos);
    if (this.simulando) return;
    if (hallazgos.length) {
      await this.guardarFila(v.id, { estado: 'BLOQUEADA_PRIVACIDAD', error: ('PRIVACIDAD:' + hallazgos.map((h) => `${h.tipo}x${h.cantidad}`).join(',')).slice(0, 60) });
      this.log.warn(`Solicitud bloqueada por privacidad (versión ${v.id}): ${hallazgos.map((h) => `${h.tipo}x${h.cantidad}`).join(', ')}`);
      r.bloqueadas++;
      return;
    }
    const huella = huellaContenido(fragmentos);
    const previa = await this.prisma.contratacionIaExtraccion.findFirst({ where: { huella, extractor: EXTRACTOR_VERSION, estado: 'OK' } });
    if (previa?.resultado) {
      await this.aplicar(v, doc, previa.resultado as any, edificiosDoc);
      await this.guardarFila(v.id, { estado: 'OK', huella, modelo: previa.modelo, resultado: previa.resultado as any, descartes: previa.descartes as any });
      r.desde_cache++;
      return;
    }
    if (llamadasPrevias >= claudeMaxDocsEjecucion()) { await this.guardarFila(v.id, { estado: 'PENDIENTE_IA', huella }); r.pendientes++; r.detenido = 'TOPE_POR_ACTUALIZACION'; return; }

    const modelo = claudeModelo();
    const solicitud = construirSolicitud(fragmentos, claudeMaxTokensSalida());
    if (estimarTokens(solicitud.system.length + solicitud.messages[0].content.length) > claudeMaxTokensEntrada()) {
      await this.guardarFila(v.id, { estado: 'ERROR', huella, error: 'ENTRADA_EXCEDE_TOPE', proximo_intento: new Date(Date.now() + 7 * 864e5) });
      r.errores++;
      return;
    }
    const reserva = await this.reservar(v.id, modelo);
    if (reserva === null) { await this.guardarFila(v.id, { estado: 'PENDIENTE_IA', huella }); r.pendientes++; r.limite_alcanzado = true; r.detenido = 'LIMITE_DIARIO'; return; }

    const t0 = Date.now();
    try {
      const resp = await this.carril.ejecutar(() => this.cliente.extraer(modelo, solicitud));
      contarLlamada();
      r.llamadas++;
      r.tokens_entrada += resp.tokens_entrada;
      r.tokens_salida += resp.tokens_salida;
      await this.prisma.contratacionIaLlamada.update({
        where: { id: reserva },
        data: { estado: 'OK', http: resp.http, tokens_entrada: resp.tokens_entrada, tokens_salida: resp.tokens_salida, duracion_ms: Date.now() - t0, costo_usd: this.costo(resp.tokens_entrada, resp.tokens_salida) },
      });
      const previo = await this.prisma.contratacionIaExtraccion.findUnique({ where: { version_id_extractor: { version_id: v.id, extractor: EXTRACTOR_VERSION } } });
      const valida = validarRespuesta(resp.entrada, fragmentos);
      // El desglose de la tabla de presupuesto, cuando se puede asociar y cuadra aritméticamente, se toma del texto nativo (sin relajar la evidencia).
      const resultado = fusionarPresupuestoNativo({ esquema: ESQUEMA_RESULTADO, trazabilidad: { extractor: EXTRACTOR_VERSION, modelo } as any, campos: valida.campos, areas: valida.areas, partidas: valida.partidas as any[] }, paginas).resultado;
      await this.aplicar(v, doc, resultado, edificiosDoc);
      await this.guardarFila(v.id, {
        estado: 'OK', huella, modelo, resultado: resultado as any, descartes: valida.descartes as any, error: null, proximo_intento: null,
        tokens_entrada: resp.tokens_entrada, tokens_salida: resp.tokens_salida, intentos: (previo?.intentos ?? 0) + 1,
      });
    } catch (e) {
      const codigo = e instanceof ErrorClaude ? e.codigo : 'ERROR_INTERNO';
      await this.prisma.contratacionIaLlamada.update({ where: { id: reserva }, data: { estado: 'ERROR', http: e instanceof ErrorClaude ? e.http : null, duracion_ms: Date.now() - t0 } }).catch(() => undefined);
      const previo = await this.prisma.contratacionIaExtraccion.findUnique({ where: { version_id_extractor: { version_id: v.id, extractor: EXTRACTOR_VERSION } } });
      const intentos = (previo?.intentos ?? 0) + 1;
      // Se conserva lo último verificado; la tarea queda reintentable con espera creciente (15 min, 30, 60... hasta 24 h).
      await this.guardarFila(v.id, { estado: 'ERROR', huella, error: codigo.slice(0, 60), intentos, proximo_intento: new Date(Date.now() + Math.min(15 * 2 ** (intentos - 1), 1440) * 60_000) });
      r.errores++;
      if (codigo === 'CLAVE_RECHAZADA' || codigo === 'LIMITE_API' || codigo === 'SIN_CLAVE') r.detenido = codigo;
    }
  }

  private anotar(versionId: number, accion: string, paginas: number[], caracteres: number, hallazgos: HallazgoPrivacidad[]) {
    if (this.simulacion) this.simulacion.push({ version_id: versionId, accion, paginas_enviadas: paginas, caracteres, tokens_estimados: estimarTokens(caracteres), hallazgos });
  }

  // ------------------------------------------------------------------ aplicación de resultados
  private async registrarAreas(v: any, edificiosDoc: number[], areas: Array<AreaNativa & { edificio: string | null }>, origen: 'NATIVO' | 'CLAUDE', etapa: string | null) {
    if (!areas.length) return;
    const conocidos = await this.prisma.contratacionEdificio.findMany({ select: { id: true, nombre_norm: true } });
    for (const a of areas) {
      let edificio: number | null = edificiosDoc.length === 1 ? edificiosDoc[0] : null;
      if (a.edificio) {
        const nombrado = conocidos.find((c) => c.nombre_norm === normalizar(a.edificio!));
        // El documento ya tiene un edificio confirmado: una superficie que nombra otro edificio no se atribuye a ninguno.
        if (nombrado && edificio !== null && nombrado.id !== edificio) edificio = null;
        else if (nombrado && edificiosDoc.length === 0) edificio = nombrado.id;
      }
      await this.prisma.contratacionAreaDocumentada.upsert({
        where: { version_id_pagina_tipo_valor: { version_id: v.id, pagina: a.pagina, tipo: a.tipo, valor: a.valor } },
        create: { version_id: v.id, pagina: a.pagina, valor: a.valor, tipo: a.tipo, edificio_id: edificio, etapa, cita: a.cita, origen, estado: edificio !== null && a.tipo !== 'CANTIDAD' ? 'DOCUMENTADA' : 'EN_REVISION' },
        update: {}, // una superficie ya registrada (o descartada por una persona) no se reescribe
      });
    }
  }

  /** Sugerencias con evidencia y superficies; nunca crea asociaciones confirmadas ni toca importes, contratos o expedientes. */
  private async aplicar(v: any, doc: any, res: Pick<Extraccion, 'campos' | 'areas'> & { partidas?: unknown }, edificiosDoc: number[]) {
    const c = res.campos ?? {};
    const sug = async (tipo: string, valor: string | number | undefined, pagina: number | undefined) => {
      if (valor === undefined || pagina === undefined) return;
      await this.prisma.contratacionDocSugerencia.upsert({
        where: { documento_id_tipo_valor_fuente_tipo_fuente_detalle: { documento_id: doc.id, tipo, valor: String(valor), fuente_tipo: 'PDF_PAGINA', fuente_detalle: `p. ${pagina} · lectura asistida` } },
        create: { documento_id: doc.id, tipo, valor: String(valor), fuente_tipo: 'PDF_PAGINA', fuente_detalle: `p. ${pagina} · lectura asistida` },
        update: {}, // conserva CONFIRMADA / DESCARTADA
      });
    };
    await sug('EXPEDIENTE', c.proceso?.valor, c.proceso?.pagina);
    await sug('EDIFICACION', c.edificio?.valor, c.edificio?.pagina);
    await sug('EMPRESA', c.contratista?.valor, c.contratista?.pagina);
    const cat = c.etapa ? CATEGORIA_POR_ETAPA[String(c.etapa.valor)] : null;
    if (cat) await sug('CATEGORIA', cat, c.etapa!.pagina);
    await this.registrarAreas(v, edificiosDoc, (res.areas ?? []).map((a) => ({ valor: a.valor, tipo: a.tipo as any, pagina: a.pagina, cita: a.cita, edificio: a.edificio })), 'CLAUDE', c.etapa ? String(c.etapa.valor) : null);
  }
}
