import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from 'libs/core/services/prisma.service';
import { clasificar, esTranscripcion } from './contratacion-clasificador';
import { docsDir, driveRootId } from './contratacion.config';
import {
  CONTRATACION_DRIVE_CLIENT, DriveArchivo, DriveClient, MIME_ATAJO, MIME_CARPETA,
} from './contratacion-drive.client';
import { escanearLocal, resolverDentro } from './contratacion-fuente-local';
import { extraerCeldas, leerCeldas } from './contratacion-excel';
import { MODELOS_CON_FUENTE, decidirCelda } from './contratacion-cambios';
import { normalizar, sugerir } from './contratacion-sugerencias';
import { completarConOcr, MOTOR_OCR, OcrLocal } from './contratacion-ocr';
import { ContratacionContratosService } from './contratacion-contratos.service';
import { ContratacionMatrizService } from './contratacion-matriz.service';
import { ContratacionIaService } from './contratacion-ia.service';

interface Candidato {
  tipo: 'LOCAL' | 'DRIVE';
  idOrigen: string;
  nombre: string;
  tamano: number | null;
  modificadoEn: Date | null;
  md5: string;
  mime: string;
  ruta?: string;
  leerBytes: () => Promise<Buffer>;
}

export interface ResumenFuente {
  estado: 'SIN_CONFIGURAR' | 'VACIA' | 'CORRECTA' | 'ERROR';
  total: number;
  nuevos: number;
  retirados: number;
  errores: number;
  modificados?: number;
  detalle?: string;
}

export interface CambioIndice { fuente: 'LOCAL' | 'DRIVE'; nombre: string; tipo: 'NUEVO' | 'MODIFICADO' | 'RETIRADO' }

/** Una actualización del índice (manual o automática), consultable mientras corre y al terminar. */
export interface TrabajoIndice {
  id: number;
  origen: 'MANUAL' | 'AUTOMATICA';
  estado: 'EN_CURSO' | 'FINALIZADA' | 'ERROR';
  iniciado_en: string;
  finalizado_en: string | null;
  resultado: { local: ResumenFuente; drive: ResumenFuente } | null;
  cambios: CambioIndice[];
  error: string | null;
}

export async function textoPrimeraPagina(buf: Buffer, mime: string): Promise<string> {
  if (mime !== 'application/pdf') return '';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdf = require('pdf-parse/lib/pdf-parse.js');
  for (let intento = 0; intento < 3; intento++) {
    try {
      const texto: string = (await pdf(buf, { max: 1 })).text ?? '';
      if (texto.trim()) return texto;
    } catch {
      /* se reintenta */
    }
  }
  return '';
}

export async function paginasPdf(buf: Buffer, max = 2): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdf = require('pdf-parse/lib/pdf-parse.js');
  for (let intento = 0; intento < 3; intento++) {
    try {
      const paginas: string[] = [];
      await pdf(buf, {
        max,
        pagerender: async (pd: any) => {
          const tc = await pd.getTextContent();
          const txt = tc.items.map((i: any) => i.str).join(' ');
          paginas.push(txt);
          return txt;
        },
      });
      if (paginas.some((p) => p.trim())) return paginas;
    } catch {
      /* se reintenta */
    }
  }
  return [];
}

@Injectable()
export class ContratacionIndiceService {
  private readonly log = new Logger(ContratacionIndiceService.name);
  private enCurso = false;
  private candidatosVistos = new Map<string, Candidato>();
  private confirmarVacia = false;
  private trabajo: TrabajoIndice | null = null;
  private secuencia = 0;
  private readonly ocr = new OcrLocal();
  private readonly contratos = new ContratacionContratosService(this.prisma);
  readonly ia = new ContratacionIaService(this.prisma);
  private readonly matriz = new ContratacionMatrizService(this.prisma);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTRATACION_DRIVE_CLIENT) private readonly drive: DriveClient,
  ) {}

  get ocupado(): boolean {
    return this.enCurso;
  }

  /**
   * `confirmarVacia` (por defecto true: actualización manual): permite retirar todos los documentos de una fuente que
   * aparece vacía. La sincronización programada lo desactiva y no retira nada ante una carpeta vacía inesperada.
   */
  async reindexar(opciones: { confirmarVacia?: boolean; origen?: 'MANUAL' | 'AUTOMATICA'; ia?: { versiones: number[] } } = {}): Promise<{ local: ResumenFuente; drive: ResumenFuente }> {
    if (this.enCurso) throw new Error('Ya hay una actualización del índice en curso');
    this.enCurso = true;
    this.confirmarVacia = opciones.confirmarVacia !== false;
    const trabajo: TrabajoIndice = { id: ++this.secuencia, origen: opciones.origen ?? 'MANUAL', estado: 'EN_CURSO', iniciado_en: new Date().toISOString(), finalizado_en: null, resultado: null, cambios: [], error: null };
    this.trabajo = trabajo;
    try {
      const local = await this.fuente('LOCAL', () => this.candidatosLocal());
      const drive = await this.fuente('DRIVE', () => this.candidatosDrive());
      await this.reasociarPendientes();
      await this.enriquecer();
      await this.leerContratos();
      await this.leerMatriz();
      await this.interpretarDocumentos(opciones.ia?.versiones);
      trabajo.resultado = { local, drive };
      trabajo.estado = 'FINALIZADA';
      return { local, drive };
    } catch (e) {
      trabajo.estado = 'ERROR';
      trabajo.error = (e as Error).message.slice(0, 200);
      throw e;
    } finally {
      trabajo.finalizado_en = new Date().toISOString();
      this.enCurso = false;
    }
  }

  /**
   * Botón manual: arranca la actualización en segundo plano y responde de inmediato. Si ya hay una en curso
   * (p. ej. la sincronización automática), no inicia otra: devuelve esa misma para que la interfaz la siga.
   */
  iniciar(origen: 'MANUAL' | 'AUTOMATICA' = 'MANUAL'): { trabajo: TrabajoIndice; ya_en_curso: boolean } {
    if (this.enCurso && this.trabajo) return { trabajo: this.trabajo, ya_en_curso: true };
    this.reindexar({ confirmarVacia: origen === 'MANUAL', origen }).catch((e) => this.log.warn(`Actualización del índice fallida: ${(e as Error).message}`));
    return { trabajo: this.trabajo!, ya_en_curso: false };
  }

  /** Estado de la actualización en curso o, si no hay, de la última de este proceso. */
  estadoTrabajo(): TrabajoIndice | null {
    return this.trabajo;
  }

  private async fuente(tipo: 'LOCAL' | 'DRIVE', obtener: () => Promise<Candidato[] | null>): Promise<ResumenFuente> {
    const ahora = new Date();
    const r: ResumenFuente = { estado: 'CORRECTA', total: 0, nuevos: 0, retirados: 0, errores: 0, modificados: 0 };
    try {
      const cands = await obtener();
      if (cands === null) {
        r.estado = 'SIN_CONFIGURAR';
        r.detalle = tipo === 'DRIVE' ? 'Drive sin vincular o sin carpeta raíz configurada' : 'Carpeta local no configurada';
      } else {
        const vistos = new Set<string>();
        for (const c of cands) {
          vistos.add(c.idOrigen);
          this.candidatosVistos.set(c.md5, c);
          try {
            const res = await this.procesar(c);
            if (res === 'NUEVO') r.nuevos++;
            else if (res === 'MODIFICADO') r.modificados = (r.modificados ?? 0) + 1;
            if (res === 'NUEVO' || res === 'MODIFICADO') this.trabajo?.cambios.push({ fuente: tipo, nombre: c.nombre, tipo: res });
          } catch (e) {
            r.errores++;
            this.log.warn(`Origen ${tipo} no procesado: ${(e as Error).message}`);
          }
        }
        r.total = cands.length;
        // Solo tras un escaneo completo se retiran los orígenes que ya no están.
        const activos = await this.prisma.contratacionDocumentoOrigen.findMany({ where: { tipo, estado: 'ACTIVO' }, select: { id: true, id_origen: true } });
        const faltan = activos.filter((a) => !vistos.has(a.id_origen)).map((a) => a.id);
        if (cands.length === 0 && faltan.length > 0 && !this.confirmarVacia) {
          // Carpeta vacía donde antes había documentos: no se retira nada hasta confirmarlo con una actualización manual.
          r.detalle = 'La carpeta aparece vacía; no se retiró ningún documento. Confirme con una actualización manual si es correcto.';
        } else if (faltan.length) {
          await this.prisma.contratacionDocumentoOrigen.updateMany({ where: { id: { in: faltan } }, data: { estado: 'RETIRADO', motivo_retiro: 'NO_ENCONTRADO' } });
          r.retirados = faltan.length;
          this.trabajo?.cambios.push(...faltan.map((): CambioIndice => ({ fuente: tipo, nombre: 'Archivo que ya no está en la fuente', tipo: 'RETIRADO' })));
        }
        if (cands.length === 0) r.estado = 'VACIA';
      }
      await this.prisma.contratacionFuenteEstado.upsert({
        where: { tipo },
        create: { tipo, estado: r.estado, ultimo_intento: ahora, ultima_correcta: r.estado === 'CORRECTA' || r.estado === 'VACIA' ? ahora : null, total: r.total, detalle: r.detalle ?? null },
        update: { estado: r.estado, ultimo_intento: ahora, total: r.total, detalle: r.detalle ?? null, ...(r.estado === 'CORRECTA' || r.estado === 'VACIA' ? { ultima_correcta: ahora } : {}) },
      });
    } catch (e) {
      // Fallo de conexión/lectura: no se retira nada ni se tocan los datos existentes.
      r.estado = 'ERROR';
      r.detalle = (e as Error).message.slice(0, 200);
      await this.prisma.contratacionFuenteEstado.upsert({
        where: { tipo },
        create: { tipo, estado: 'ERROR', ultimo_intento: ahora, detalle: r.detalle },
        update: { estado: 'ERROR', ultimo_intento: ahora, detalle: r.detalle },
      });
    }
    return r;
  }

  private async candidatosLocal(): Promise<Candidato[] | null> {
    const base = docsDir();
    const esc = await escanearLocal(base);
    return esc.archivos.map((a) => ({
      tipo: 'LOCAL' as const, idOrigen: a.idOrigen, nombre: a.nombre, tamano: a.tamano, modificadoEn: a.modificadoEn,
      md5: a.md5, mime: a.mime, ruta: a.idOrigen,
      leerBytes: async () => {
        const real = await resolverDentro(base, a.idOrigen);
        if (!real) throw new Error('ruta fuera de la carpeta permitida');
        return fs.promises.readFile(real);
      },
    }));
  }

  private async candidatosDrive(): Promise<Candidato[] | null> {
    const raiz = driveRootId();
    if (!raiz || !this.drive.configurado()) return null;
    const out: Candidato[] = [];
    const cola: Array<{ id: string; ruta: string; prof: number }> = [{ id: raiz, ruta: '', prof: 0 }];
    const visitadas = new Set<string>([raiz]);
    while (cola.length) {
      const { id, ruta, prof } = cola.shift()!;
      let pageToken: string | undefined;
      do {
        const pag = await this.drive.listarCarpeta(id, pageToken);
        for (const f of pag.archivos) {
          if (f.trashed || f.mimeType === MIME_ATAJO) continue; // atajos: destinos no verificables
          if (f.mimeType === MIME_CARPETA) {
            if (prof < 8 && !visitadas.has(f.id)) { visitadas.add(f.id); cola.push({ id: f.id, ruta: `${ruta}${f.name}/`, prof: prof + 1 }); }
            continue;
          }
          if (esTranscripcion(f.name)) continue;
          out.push(this.candidatoDrive(f, ruta));
        }
        pageToken = pag.siguiente;
      } while (pageToken);
    }
    return out;
  }

  private candidatoDrive(f: DriveArchivo, ruta: string): Candidato {
    const nativo = f.mimeType.startsWith('application/vnd.google-apps.');
    return {
      tipo: 'DRIVE', idOrigen: f.id, nombre: f.name, tamano: f.size ? Number(f.size) : null,
      modificadoEn: f.modifiedTime ? new Date(f.modifiedTime) : null,
      md5: f.md5Checksum ?? `gdoc:${f.id}:${f.modifiedTime ?? ''}`,
      mime: f.mimeType, ruta: `${ruta}${f.name}`,
      leerBytes: async () => {
        if (nativo) return Buffer.alloc(0);
        const d = await this.drive.descargar(f.id);
        const partes: Buffer[] = [];
        for await (const ch of d.stream) partes.push(Buffer.from(ch));
        return Buffer.concat(partes);
      },
    };
  }

  /** Devuelve NUEVO (documento nuevo), MODIFICADO (nueva versión de un documento ya indexado) o null. Idempotente. */
  private async procesar(c: Candidato): Promise<'NUEVO' | 'MODIFICADO' | null> {
    const p = this.prisma;
    const meta = { nombre_original: c.nombre, ruta: c.ruta ?? null, mime: c.mime, tamano: c.tamano, modificado_en: c.modificadoEn, visto_en: new Date() };
    const previo = await p.contratacionDocumentoOrigen.findFirst({
      where: { tipo: c.tipo, id_origen: c.idOrigen, estado: 'ACTIVO' },
      include: { version: true },
    });
    if (previo && previo.version.md5 === c.md5) {
      await p.contratacionDocumentoOrigen.update({ where: { id: previo.id }, data: meta });
      return null;
    }
    let documentoPrevioId: number | null = null;
    if (previo) {
      await p.contratacionDocumentoOrigen.update({ where: { id: previo.id }, data: { estado: 'RETIRADO', motivo_retiro: 'REEMPLAZADO_POR_NUEVA_VERSION' } });
      documentoPrevioId = previo.version.documento_id;
    }
    const existente = await p.contratacionDocumentoVersion.findUnique({ where: { md5: c.md5 } });
    let versionId: number;
    let creado = false;
    if (existente) {
      versionId = existente.id; // mismo contenido ya indexado (p. ej. copia local y de Drive)
    } else {
      const texto = await textoPrimeraPagina(await c.leerBytes(), c.mime);
      const cl = clasificar(c.nombre, texto);
      let docId = documentoPrevioId;
      if (docId === null) {
        const doc = await p.contratacionDocumento.create({
          data: {
            nombre: c.nombre, categoria: cl.categoria ?? 'SIN_CATEGORIA',
            fecha_documento: cl.fecha ? new Date(`${cl.fecha}T00:00:00Z`) : null,
            proceso_detectado: cl.proceso,
          },
        });
        docId = doc.id;
        await this.asociar(docId, cl.proceso, cl.categoria, cl.objeto, cl.fecha);
      } else {
        await p.contratacionDocumento.update({
          where: { id: docId },
          data: {
            ...(cl.categoria ? { categoria: cl.categoria } : {}),
            ...(cl.fecha ? { fecha_documento: new Date(`${cl.fecha}T00:00:00Z`) } : {}),
            ...(cl.proceso ? { proceso_detectado: cl.proceso } : {}),
          },
        });
        await p.contratacionDocumentoVersion.updateMany({ where: { documento_id: docId }, data: { vigente: false, reemplazada_en: new Date() } });
      }
      const max = await p.contratacionDocumentoVersion.aggregate({ where: { documento_id: docId }, _max: { numero: true } });
      const v = await p.contratacionDocumentoVersion.create({
        data: { documento_id: docId, numero: (max._max.numero ?? 0) + 1, md5: c.md5, tamano: c.tamano != null ? BigInt(c.tamano) : null, vigente: true },
      });
      versionId = v.id;
      creado = true;
      if (previo) {
        try {
          await this.seguirCifras(previo.version.id, versionId, c);
        } catch (e) {
          this.log.warn(`No se pudo comparar las cifras de la versión anterior: ${(e as Error).message}`);
        }
      }
    }
    await p.contratacionDocumentoOrigen.upsert({
      where: { tipo_id_origen_version_id: { tipo: c.tipo, id_origen: c.idOrigen, version_id: versionId } },
      create: { version_id: versionId, tipo: c.tipo, id_origen: c.idOrigen, estado: 'ACTIVO', ...meta },
      update: { estado: 'ACTIVO', motivo_retiro: null, ...meta },
    });
    return creado ? (previo ? 'MODIFICADO' : 'NUEVO') : null;
  }

  /** Cifras que citan la versión anterior: se revinculan si su celda no cambió y se señalan si cambió. */
  private async seguirCifras(anteriorId: number, nuevaId: number, c: Candidato) {
    const p = this.prisma;
    const esHoja = c.mime.includes('spreadsheetml');
    const esPdf = c.mime === 'application/pdf';
    if (!esHoja && !esPdf) return;
    const registros: Array<{ entidad: string; model: string; id: number; clave: string; expediente_id: number; hoja: string | null; celda: string | null; pagina: number | null }> = [];
    for (const m of MODELOS_CON_FUENTE) {
      const filas = await (p as any)[m.model].findMany({ where: { version_id: anteriorId }, select: { id: true, clave: true, expediente_id: true, hoja: true, celda: true, pagina: true } });
      for (const f of filas) registros.push({ entidad: m.entidad, model: m.model, ...f });
    }
    const alertar = async (r: (typeof registros)[number], hoja: string, celda: string, anterior: string | null, nuevo: string | null) => {
      await p.contratacionAlertaCifra.upsert({
        where: { entidad_clave_expediente_id_version_nueva_id: { entidad: r.entidad, clave: r.clave, expediente_id: r.expediente_id, version_nueva_id: nuevaId } },
        create: { expediente_id: r.expediente_id, entidad: r.entidad, clave: r.clave, hoja, celda, version_anterior_id: anteriorId, version_nueva_id: nuevaId, valor_anterior: anterior, valor_nuevo: nuevo },
        update: {},
      });
    };
    if (esPdf) {
      // Sin comparación de contenido por página: toda cifra que cita una página de un PDF que cambió se verifica.
      for (const r of registros.filter((x) => x.pagina != null)) await alertar(r, 'PDF', `pág. ${r.pagina}`, null, null);
      return;
    }
    const conCelda = registros.filter((x) => x.hoja && x.celda);
    const respaldos = await p.contratacionCeldaRespaldo.findMany({ where: { version_id: anteriorId } });
    const refs = new Map<string, { hoja: string; celda: string }>();
    for (const r of conCelda) refs.set(`${r.hoja}!${r.celda}`, { hoja: r.hoja!, celda: r.celda! });
    for (const s of respaldos) refs.set(`${s.hoja}!${s.celda}`, { hoja: s.hoja, celda: s.celda });
    if (refs.size === 0) return;
    const lista = [...refs.entries()];
    const nuevos = await leerCeldas(await c.leerBytes(), lista.map(([, v]) => v));
    const nuevoDe = new Map(lista.map(([k], i) => [k, nuevos[i]]));
    const anteriorDe = new Map(respaldos.map((s) => [`${s.hoja}!${s.celda}`, s.valor]));
    for (const [k, v] of lista) {
      await p.contratacionCeldaRespaldo.upsert({ where: { version_id_hoja_celda: { version_id: nuevaId, hoja: v.hoja, celda: v.celda } }, create: { version_id: nuevaId, hoja: v.hoja, celda: v.celda, valor: nuevoDe.get(k) ?? null }, update: { valor: nuevoDe.get(k) ?? null } });
    }
    for (const r of conCelda) {
      const k = `${r.hoja}!${r.celda}`;
      if (!anteriorDe.has(k)) { await alertar(r, r.hoja!, r.celda!, null, nuevoDe.get(k) ?? null); continue; } // sin línea base: se pide revisión
      const dec = decidirCelda(anteriorDe.get(k) ?? null, nuevoDe.get(k) ?? null);
      if (dec.accion === 'ALERTAR') await alertar(r, r.hoja!, r.celda!, dec.valor_anterior, dec.valor_nuevo);
      else {
        await (p as any)[r.model].update({ where: { id: r.id }, data: { version_id: nuevaId } });
        await p.contratacionAuditoria.create({ data: { entidad: r.entidad, clave: r.clave, expediente_id: r.expediente_id, accion: 'REVINCULAR_VERSION', anterior: { version_id: anteriorId } as any, nuevo: { version_id: nuevaId, hoja: r.hoja, celda: r.celda } as any } });
      }
    }
  }

  /** Asocia un documento a su expediente solo con evidencia (número de proceso). */
  private async asociar(docId: number, proceso: string | null, categoria: string | null, objeto: string | null, fecha: string | null) {
    if (!proceso) return;
    let exp = await this.prisma.contratacionExpediente.findUnique({ where: { proceso } });
    if (!exp && categoria === 'ANALISIS_SECTOR') {
      exp = await this.prisma.contratacionExpediente.create({
        data: {
          proceso, intervencion: 'Pendiente de soporte', objeto, estado_documentado: 'ANALISIS_DEL_SECTOR',
          fecha_documento: fecha ? new Date(`${fecha}T00:00:00Z`) : null,
        },
      });
    }
    if (exp) {
      await this.prisma.contratacionDocumento.update({ where: { id: docId }, data: { expediente_id: exp.id, estado_clasificacion: 'ASOCIADO' } });
    }
  }

  /**
   * Completa el índice de búsqueda y las sugerencias de las versiones que aún no las tienen.
   * Idempotente: no pisa sugerencias ya confirmadas o descartadas.
   */
  private async enriquecer() {
    const p = this.prisma;
    const versiones = await p.contratacionDocumentoVersion.findMany({
      where: { indice: null, origenes: { some: { estado: 'ACTIVO' } } },
      include: { documento: true, origenes: { where: { estado: 'ACTIVO' } } },
    });
    if (versiones.length === 0) return;
    const conocidas = await this.edificacionesConocidas();
    for (const v of versiones) {
      const cand = this.candidatosVistos.get(v.md5);
      if (!cand) continue;
      try {
        const ruta = v.origenes.find((o) => o.ruta)?.ruta ?? null;
        let paginas: { pagina: number; texto: string }[] = [];
        let celdas: { ref: string; texto: string }[] = [];
        let hojas: any = null;
        if (cand.mime === 'application/pdf') {
          paginas = (await paginasPdf(await cand.leerBytes())).map((texto, i) => ({ pagina: i + 1, texto }));
          // Documento escaneado: OCR local solo de las páginas sin texto nativo, guardado por versión y página.
          const c = await completarConOcr({
            ejecutor: this.ocr,
            pdf: () => cand.leerBytes(),
            paginas,
            cache: async (pagina) => (await p.contratacionOcrPagina.findUnique({ where: { version_id_pagina: { version_id: v.id, pagina } } }))?.texto ?? null,
            guardar: async (pagina, texto) => {
              await p.contratacionOcrPagina.upsert({
                where: { version_id_pagina: { version_id: v.id, pagina } },
                create: { version_id: v.id, pagina, texto, motor: MOTOR_OCR },
                update: { texto, motor: MOTOR_OCR },
              });
            },
          });
          paginas = c.paginas;
        } else if (cand.mime.includes('spreadsheetml')) {
          const x = await extraerCeldas(await cand.leerBytes());
          celdas = x.celdas;
          hojas = x.hojas;
        }
        const texto = normalizar(
          [v.documento.nombre, ruta ?? '', paginas.map((x) => x.texto).join(' ').slice(0, 6000), celdas.map((c) => c.texto).join(' ').slice(0, 6000), (hojas ?? []).map((h: any) => h.nombre).join(' ')].join(' '),
        );
        await p.contratacionDocIndice.upsert({ where: { version_id: v.id }, create: { version_id: v.id, texto, hojas }, update: { texto, hojas, extraido_en: new Date() } });
        const sugs = sugerir({ ruta, nombre: cand.nombre, paginas, celdas, edificacionesConocidas: conocidas });
        for (const s of sugs) {
          await p.contratacionDocSugerencia.upsert({
            where: { documento_id_tipo_valor_fuente_tipo_fuente_detalle: { documento_id: v.documento_id, tipo: s.tipo, valor: s.valor, fuente_tipo: s.fuente_tipo, fuente_detalle: s.fuente_detalle } },
            create: { documento_id: v.documento_id, ...s },
            update: {}, // conserva CONFIRMADA / DESCARTADA
          });
        }
        await this.sugerirExpedientePorResolucion(v.documento_id);
      } catch (e) {
        this.log.warn(`Sin extracto para una versión: ${(e as Error).message}`);
      }
    }
  }

  /** Lee los contratos en PDF (texto nativo) y los asocia a su expediente; un fallo aquí no invalida la actualización del índice. */
  private async leerContratos() {
    try {
      const r = await this.contratos.procesar(async (_id, md5) => {
        const cand = this.candidatosVistos.get(md5);
        return cand ? await paginasPdf(await cand.leerBytes(), 80) : null;
      });
      if (r.leidos) this.log.log(`Contratos leídos: ${r.leidos}; asociados ${r.asociados}; fichas ${r.fichas}; en revisión ${r.revision}`);
    } catch (e) {
      this.log.warn(`Sin lectura de contratos: ${(e as Error).message}`);
    }
  }

  /** Lee la matriz de contratación en Excel (celda a celda) y la vincula con los expedientes; un fallo aquí no invalida la actualización. */
  private async leerMatriz() {
    try {
      const r = await this.matriz.procesar(async (md5) => {
        const cand = this.candidatosVistos.get(md5);
        return cand ? await cand.leerBytes() : null;
      });
      if (r.versiones) this.log.log(`Matriz de contratación leída: ${r.versiones} archivo(s), ${r.filas} fila(s); vinculadas ${r.vinculadas}`);
    } catch (e) {
      this.log.warn(`Sin lectura de la matriz de contratación: ${(e as Error).message}`);
    }
  }

  /** Lectura asistida de lo que la lectura nativa no resolvió (sin clave queda pendiente); un fallo aquí no invalida la actualización. */
  private async interpretarDocumentos(versiones?: number[]) {
    try {
      await this.ia.procesar(
        {
        paginas: async (md5, max) => { const cand = this.candidatosVistos.get(md5); return cand && cand.mime === 'application/pdf' ? await paginasPdf(await cand.leerBytes(), max) : null; },
        bytes: async (md5) => { const cand = this.candidatosVistos.get(md5); return cand ? await cand.leerBytes() : null; },
        },
        versiones ? { versiones } : {},
      );
    } catch (e) {
      this.log.warn(`Sin lectura asistida: ${(e as Error).message}`);
    }
  }

  private async edificacionesConocidas(): Promise<string[]> {
    const set = new Set<string>();
    const origenes = await this.prisma.contratacionDocumentoOrigen.findMany({ where: { estado: 'ACTIVO', ruta: { contains: '/' } }, select: { ruta: true } });
    for (const o of origenes) {
      const parte = (o.ruta ?? '').split('/')[0].replace(/^\s*\d+\s*[.\-)]\s*/, '').trim();
      if (parte.length >= 5) set.add(parte);
    }
    const hechos = await this.prisma.contratacionHecho.findMany({ where: { tipo: 'EDIFICACION' }, select: { titulo: true } });
    for (const h of hechos) { const base = h.titulo.split(/\s[–-]\s/)[0].trim(); if (base.length >= 5) set.add(base); }
    return [...set];
  }

  /** Si un documento cita la resolución que un expediente menciona, se sugiere ese expediente (sin confirmarlo). */
  private async sugerirExpedientePorResolucion(documentoId: number) {
    const resoluciones = await this.prisma.contratacionDocSugerencia.findMany({ where: { documento_id: documentoId, tipo: 'RESOLUCION' } });
    for (const r of resoluciones) {
      const numero = r.valor.split('-')[0];
      const hechos = await this.prisma.contratacionHecho.findMany({ where: { OR: [{ detalle: { contains: numero } }, { titulo: { contains: numero } }] }, select: { expediente: { select: { proceso: true } }, clave: true } });
      for (const h of hechos) {
        await this.prisma.contratacionDocSugerencia.upsert({
          where: { documento_id_tipo_valor_fuente_tipo_fuente_detalle: { documento_id: documentoId, tipo: 'EXPEDIENTE', valor: h.expediente.proceso, fuente_tipo: 'RESOLUCION_CITADA', fuente_detalle: `Resolución ${r.valor}` } },
          create: { documento_id: documentoId, tipo: 'EXPEDIENTE', valor: h.expediente.proceso, fuente_tipo: 'RESOLUCION_CITADA', fuente_detalle: `Resolución ${r.valor}` },
          update: {},
        });
      }
    }
  }

  private async reasociarPendientes() {
    // Reclasifica los documentos cuyo texto no pudo leerse antes (sin proceso detectado).
    const sinProceso = await this.prisma.contratacionDocumento.findMany({
      where: { expediente_id: null, proceso_detectado: null },
      include: { versiones: { where: { vigente: true } } },
    });
    for (const d of sinProceso) {
      const cand = d.versiones[0] ? this.candidatosVistos.get(d.versiones[0].md5) : undefined;
      if (!cand) continue;
      try {
        const cl = clasificar(cand.nombre, await textoPrimeraPagina(await cand.leerBytes(), cand.mime));
        if (!cl.proceso) continue;
        await this.prisma.contratacionDocumento.update({
          where: { id: d.id },
          data: { proceso_detectado: cl.proceso, ...(cl.categoria ? { categoria: cl.categoria } : {}), ...(cl.fecha ? { fecha_documento: new Date(`${cl.fecha}T00:00:00Z`) } : {}) },
        });
        await this.asociar(d.id, cl.proceso, cl.categoria, cl.objeto, cl.fecha);
      } catch {
        /* queda pendiente de clasificación */
      }
    }
    const pend = await this.prisma.contratacionDocumento.findMany({ where: { expediente_id: null, proceso_detectado: { not: null } } });
    for (const d of pend) {
      const exp = await this.prisma.contratacionExpediente.findUnique({ where: { proceso: d.proceso_detectado! } });
      if (exp) await this.prisma.contratacionDocumento.update({ where: { id: d.id }, data: { expediente_id: exp.id, estado_clasificacion: 'ASOCIADO' } });
    }
  }
}

