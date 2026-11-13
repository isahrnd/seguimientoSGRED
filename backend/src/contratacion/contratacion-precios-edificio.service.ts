import { Injectable } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { areaParaPrecio } from './contratacion-areas';
import { ContratacionConsultaService } from './contratacion-consulta.service';
import { ContratacionEdificiosService } from './contratacion-edificios.service';
import { ConsolidadoEntrada, construirFila, FilaEdificio, FuenteDato, ProcesoEntrada } from './contratacion-vista-precios';
import { ofertasDeLectura } from './contratacion-vista-ofertas';
import { informeEdificio, informeGeneral } from './contratacion-informe-pdf';
import { construirLibroPrecios } from './contratacion-precios-excel';

const fuenteDe = (s: any): FuenteDato | null => (s ? { version_id: s.version_id ?? null, documento: s.documento ?? null, pagina: s.pagina ?? null, hoja: s.hoja ?? null, celda: s.celda ?? null } : null);
const num = (x: any): number | null => (x === null || x === undefined ? null : Number(x));

export interface VistaGeneral {
  fecha_corte: string | null;
  generado_en: string;
  filas: FilaEdificio[];
  resumen: { edificios: number; con_valor: number; con_contrato_respaldado: number; con_contrato_conjunto: number; solo_consolidado: number };
  /** Elementos para la revisión operativa (no forman parte de la vista ejecutiva). */
  revision: Array<{ tipo: string; edificio: string; detalle: string; fuente: FuenteDato | null }>;
  fuentes: Array<{ rotulo: string; version_id: number; documento: string }>;
}

/**
 * Reúne los datos reales (contratos, consolidado, matriz, áreas, ofertas y documentos) y los convierte en la vista por edificio con la lógica pura de
 * `contratacion-vista-precios`. La pantalla, el Excel y el PDF consumen esta misma vista: las cifras y fórmulas no se recalculan en cada salida.
 */
@Injectable()
export class ContratacionPreciosEdificioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edificios: ContratacionEdificiosService,
    private readonly consulta: ContratacionConsultaService,
  ) {}

  private async consolidadoVigente() {
    const filas = await this.prisma.contratacionConsolidadoFila.findMany({
      where: { version: { vigente: true } },
      include: { version: { include: { documento: true } } },
      orderBy: [{ version_id: 'desc' }, { fila: 'asc' }],
    });
    // Una sola versión vigente por documento: la más reciente.
    const maxVersion = new Map<number, number>();
    for (const f of filas) maxVersion.set(f.version.documento_id, Math.max(maxVersion.get(f.version.documento_id) ?? 0, f.version_id));
    return filas.filter((f) => maxVersion.get(f.version.documento_id) === f.version_id).map((f): ConsolidadoEntrada & { edificio_id: number | null } => {
      const fu = (clave: string) => ({ version_id: f.version_id, documento: f.version.documento.nombre, pagina: null, hoja: f.hoja, celda: ((f.celdas as any) ?? {})[clave] ?? null });
      return {
        id: f.id, edificio_id: f.edificio_id, nombre: f.nombre, direccion: f.direccion, estado: f.estado, avance: f.avance, valor: num(f.valor), area_m2: num(f.area_m2), valor_m2: num(f.valor_m2),
        responsable: f.responsable, formula_valor: f.formula_valor, fecha_corte: f.fecha_corte ? f.fecha_corte.toISOString().slice(0, 10) : null, vinculo: f.vinculo,
        fuentes: { valor: fu('valor'), area_m2: fu('area_m2'), valor_m2: fu('valor_m2'), responsable: fu('responsable'), estado: fu('estado') },
      };
    });
  }

  // ---------------------------------------------------------------------------------------------- caché con firma de los datos
  private cacheVista: { firma: string; en: number; vista: VistaGeneral } | null = null;
  private enCalculo: Promise<VistaGeneral> | null = null;
  private readonly cacheFichas = new Map<string, { firma: string; en: number; ficha: any }>();
  /** Vida máxima de una entrada de caché aunque la firma no cambie (red de seguridad). */
  private static readonly VIDA_MAXIMA_MS = 10 * 60_000;

  /**
   * Firma de TODO lo que alimenta la vista (documentos, versiones, orígenes, sugerencias y confirmaciones, vínculos documento-edificio, expedientes, valores,
   * contratos, ofertas, áreas, consolidado, cotizaciones verificadas y extracciones): un cambio en cualquiera de ellos cambia la firma e invalida el caché.
   * Es una sola consulta de agregados (decenas de milisegundos), mucho más barata que recalcular la vista.
   */
  async firmaDeDatos(): Promise<string> {
    const t = (tabla: string) => `(select count(*)::text||':'||coalesce(sum(hashtext(x::text)),0)::text from ${tabla} x)`;
    const tablas = ['documentos', 'doc_versiones', 'doc_origenes', 'doc_sugerencias', 'documento_edificios', 'edificios', 'expedientes', 'expediente_edificios', 'hechos', 'ofertas', 'valores', 'contratos', 'lineas', 'referencias', 'areas', 'consolidado_filas', 'cotizaciones_edificio', 'matriz_filas', 'resoluciones'];
    const partes = tablas.map((n) => t(`tbl_contratacion_${n}`));
    // Las extracciones pesan: se firman por número, estado e instante de actualización (no por su contenido).
    partes.push("(select count(*)::text||':'||coalesce(max(actualizado_en)::text,'')||':'||coalesce(string_agg(estado,'' order by id),'') from tbl_contratacion_ia_extracciones)");
    const r: any[] = await this.prisma.$queryRawUnsafe(`select md5(concat_ws('|', ${partes.join(', ')})) as firma`);
    return String(r[0].firma);
  }

  /** Vista completa; se recalcula solo si cambió la firma de los datos. */
  async vistaGeneral(): Promise<VistaGeneral> {
    const firma = await this.firmaDeDatos();
    const c = this.cacheVista;
    if (c && c.firma === firma && Date.now() - c.en < ContratacionPreciosEdificioService.VIDA_MAXIMA_MS) return c.vista;
    if (this.enCalculo) return this.enCalculo; // varias solicitudes simultáneas comparten un único cálculo
    this.enCalculo = this.calcularVista().then((vista) => { this.cacheVista = { firma, en: Date.now(), vista }; return vista; }).finally(() => { this.enCalculo = null; });
    return this.enCalculo;
  }

  /** Datos comunes del cálculo (una sola lectura de edificios, consolidado y cotizaciones verificadas; los procesos se leen una vez por proceso). */
  private async contexto() {
    const registrados = await this.prisma.contratacionEdificio.findMany({ orderBy: { nombre: 'asc' } });
    const consolidado = await this.consolidadoVigente();
    const verificadasTodas = (await this.prisma.contratacionCotizacionEdificio.findMany({ select: { version_id: true, proveedor: true, importe: true, base: true, total_oferta: true, fecha_oferta: true, edificio_id: true, referencia_oferta: true, nota: true, alcance_oferta: true } }))
      .map((c) => ({ version_id: c.version_id, proveedor: c.proveedor, importe: Number(c.importe), base: c.base, total_oferta: c.total_oferta === null ? null : Number(c.total_oferta), fecha_oferta: c.fecha_oferta ? c.fecha_oferta.toISOString().slice(0, 10) : null, edificio_id: c.edificio_id, referencia_oferta: c.referencia_oferta, nota: c.nota, alcance_oferta: c.alcance_oferta }));
    const cacheProc = new Map<number, any>();
    const detalleProceso = async (id: number) => { if (!cacheProc.has(id)) cacheProc.set(id, await this.consulta.detalle(id)); return cacheProc.get(id); };
    return { registrados, consolidado, verificadasTodas, detalleProceso };
  }

  /** Fila de UN edificio registrado: no recorre los demás edificios. */
  private async filaDeRegistrado(ed: { id: number; nombre: string; direccion: string | null }, ctx: Awaited<ReturnType<ContratacionPreciosEdificioService['contexto']>>, revision: VistaGeneral['revision']): Promise<FilaEdificio> {
    const det: any = await this.edificios.detalle(ed.id);
    const procesos: ProcesoEntrada[] = [];
    let porVincular = false;
    for (const pr of det.procesos as any[]) {
      const D: any = await ctx.detalleProceso(pr.id);
      const oficial = (D.valores ?? []).find((v: any) => v.tipo === 'PRESUPUESTO_OFICIAL');
      procesos.push({
        id: pr.id, proceso: pr.proceso, numero_contrato: D.expediente.numero_contrato ?? null, intervencion: pr.intervencion ?? null, edificios_del_proceso: pr.edificios_del_proceso,
        contratos: (D.contratacion?.contratos ?? []).map((c: any) => ({ valor: Number(c.valor), tipo_acto: c.tipo_acto, numero: c.numero ?? null, contratista: c.contratista ?? null, soporte: fuenteDe(c.soporte) })),
        reportado_matriz: D.matriz?.valor_reportado ? { importe: Number(D.matriz.valor_reportado.importe), soporte: fuenteDe(D.matriz.valor_reportado.soporte) } : null,
        presupuesto_oficial: oficial ? { importe: Number(oficial.importe), soporte: fuenteDe(oficial.soporte) } : null,
      });
      if (!(D.contratacion?.contratos ?? []).length) {
        porVincular = porVincular || (await this.prisma.contratacionDocumento.count({
          where: { categoria: 'CONTRATACION_ACTAS', expediente_id: null, NOT: { nombre: { contains: 'resoluci', mode: 'insensitive' } }, OR: [{ proceso_detectado: pr.proceso }, { sugerencias: { some: { tipo: 'EXPEDIENTE', valor: pr.proceso, estado: { not: 'DESCARTADA' } } } }] },
        })) > 0;
      }
    }
    const areas = await this.prisma.contratacionAreaDocumentada.findMany({ where: { edificio_id: ed.id, version: { vigente: true } }, include: { version: { include: { documento: true } } } });
    const ap = areaParaPrecio(areas.map((a) => ({ id: a.id, valor: Number(a.valor), tipo: a.tipo, estado: a.estado, edificio_id: a.edificio_id, pagina: a.pagina, cita: a.cita, soporte: { version_id: a.version_id, documento: a.version.documento.nombre, pagina: a.pagina } })), [ed.id]);
    const cons = ctx.consolidado.find((c) => c.edificio_id === ed.id) ?? null;
    const ofertas = ofertasDeLectura(det.lectura_asistida ?? [], { id: ed.id, nombre: ed.nombre }, ctx.verificadasTodas);
    const fila = construirFila({
      edificio: { id: ed.id, nombre: ed.nombre, direccion: ed.direccion }, consolidado: cons, procesos,
      area_documentada: ap.estado === 'DOCUMENTADA' ? { valor: ap.valor, tipo: ap.tipo, cita: ap.cita, fuente: fuenteDe(ap.soporte) } : null,
      ofertas, contrato_por_vincular: porVincular, analisis_sector: (det.grupos as any[]).some((g) => g.codigo === 'ANALISIS_SECTOR' && g.documentos.length > 0),
    });
    if (ap.estado === 'CONFLICTO') revision.push({ tipo: 'Área en conflicto', edificio: ed.nombre, detalle: ap.motivo, fuente: null });
    for (const d of fila.diferencias) revision.push({ tipo: 'Diferencia entre fuentes', edificio: ed.nombre, detalle: d, fuente: null });
    return fila;
  }

  private filaDeConsolidado(c: ConsolidadoEntrada & { edificio_id: number | null }, revision: VistaGeneral['revision']): FilaEdificio {
    revision.push({ tipo: 'Edificio del consolidado sin edificio registrado', edificio: c.nombre, detalle: 'Se muestra con los datos del consolidado; no se ha vinculado a un edificio registrado.', fuente: c.fuentes.valor });
    return construirFila({ edificio: { id: null, nombre: c.nombre, direccion: c.direccion }, consolidado: c, procesos: [], area_documentada: null, ofertas: [], contrato_por_vincular: false, analisis_sector: false });
  }

  private async calcularVista(): Promise<VistaGeneral> {
    const ctx = await this.contexto();
    const filas: FilaEdificio[] = [];
    const revision: VistaGeneral['revision'] = [];
    for (const ed of ctx.registrados) filas.push(await this.filaDeRegistrado(ed, ctx, revision));
    // Filas del consolidado sin edificio registrado inequívoco: se muestran por su propio nombre; no se crean edificios.
    for (const c of ctx.consolidado.filter((x) => x.edificio_id === null)) filas.push(this.filaDeConsolidado(c, revision));
    // Orden del reporte: primero los edificios del consolidado (en su orden), luego los demás por nombre.
    filas.sort((a, b) => (a.consolidado_id ?? 1e9) - (b.consolidado_id ?? 1e9) || a.nombre.localeCompare(b.nombre, 'es'));
    const cortes = ctx.consolidado.map((c) => c.fecha_corte).filter(Boolean) as string[];
    const fuentes = [...new Map(ctx.consolidado.map((c) => [c.fuentes.valor!.version_id!, { rotulo: 'Consolidado de seguimiento', version_id: c.fuentes.valor!.version_id!, documento: c.fuentes.valor!.documento! }])).values()];
    return {
      fecha_corte: cortes.sort().pop() ?? null, generado_en: new Date().toISOString(), filas, revision, fuentes,
      resumen: {
        edificios: filas.length, con_valor: filas.filter((f) => f.valor).length, con_contrato_respaldado: filas.filter((f) => f.documento_contractual === 'RESPALDADO').length,
        con_contrato_conjunto: filas.filter((f) => f.documento_contractual === 'CONJUNTO').length, solo_consolidado: filas.filter((f) => f.valor?.procedencia === 'CONSOLIDADO').length,
      },
    };
  }

  /** Excel de la vista (las mismas filas que la pantalla y el PDF), todos los edificios o solo los indicados por clave. */
  async excelGeneral(claves?: string[]): Promise<Buffer> {
    const v = await this.vistaGeneral();
    const filas = claves?.length ? v.filas.filter((f) => claves.includes(f.clave)) : v.filas;
    return construirLibroPrecios({ fecha_corte: v.fecha_corte, generado_en: v.generado_en, filas, fuentes: v.fuentes });
  }

  /** Informe PDF del resumen de edificios (todos, o solo los indicados por clave: los filtrados en pantalla). */
  async pdfGeneral(claves?: string[]): Promise<Buffer> {
    const v = await this.vistaGeneral();
    const filas = claves?.length ? v.filas.filter((f) => claves.includes(f.clave)) : v.filas;
    return informeGeneral({ fecha_corte: v.fecha_corte, generado_en: v.generado_en, filas, fuentes: v.fuentes });
  }

  /** Informe PDF de un edificio, con anexo documental opcional. */
  async pdfEdificio(clave: string, anexo: boolean): Promise<Buffer | null> {
    const f = await this.ficha(clave);
    if (!f) return null;
    const docs = f.documentos.map((d: any) => ({ grupo: d.grupo, nombre: d.nombre, version_id: d.version_id ?? null, formato: d.formato, evidencias: (d.evidencias ?? []) as any[] }));
    return informeEdificio({ fila: f.fila, fecha_corte: f.fecha_corte, generado_en: new Date().toISOString(), documentos: docs, anexo });
  }

  /**
   * Ficha de un edificio (registrado `e<ID>` o fila del consolidado `c<ID>`). Con la vista en caché vigente la toma de ahí; si no, calcula SOLO ese edificio
   * (no recorre los demás). El resultado también se guarda con la firma de los datos.
   */
  async ficha(clave: string) {
    const firma = await this.firmaDeDatos();
    const previa = this.cacheFichas.get(clave);
    if (previa && previa.firma === firma && Date.now() - previa.en < ContratacionPreciosEdificioService.VIDA_MAXIMA_MS) return previa.ficha;
    let fila: FilaEdificio | undefined;
    let fecha_corte: string | null = null;
    let fuentes: VistaGeneral['fuentes'] = [];
    const c = this.cacheVista;
    if (c && c.firma === firma) { fila = c.vista.filas.find((f) => f.clave === clave); fecha_corte = c.vista.fecha_corte; fuentes = c.vista.fuentes; }
    if (!fila) {
      const m = /^([ec])(\d{1,6})$/.exec(clave);
      if (!m) return null;
      const ctx = await this.contexto();
      const revision: VistaGeneral['revision'] = [];
      if (m[1] === 'e') { const ed = ctx.registrados.find((x) => x.id === Number(m[2])); if (!ed) return null; fila = await this.filaDeRegistrado(ed, ctx, revision); }
      else { const cons = ctx.consolidado.find((x) => x.id === Number(m[2]) && x.edificio_id === null); if (!cons) return null; fila = this.filaDeConsolidado(cons, revision); }
      const cortes = ctx.consolidado.map((x) => x.fecha_corte).filter(Boolean) as string[];
      fecha_corte = cortes.sort().pop() ?? null;
      fuentes = [...new Map(ctx.consolidado.map((x) => [x.fuentes.valor!.version_id!, { rotulo: 'Consolidado de seguimiento', version_id: x.fuentes.valor!.version_id!, documento: x.fuentes.valor!.documento! }])).values()];
    }
    const detalle: any = fila.edificio_id !== null ? await this.edificios.detalle(fila.edificio_id) : null;
    const documentos = detalle ? (detalle.grupos as any[]).flatMap((g) => g.documentos.map((d: any) => ({ grupo: g.nombre, documento_id: d.documento_id, version_id: d.version_id, nombre: d.nombre, formato: d.formato, disponible: d.disponible, evidencias: d.evidencias }))) : [];
    const consolidado = fuentes.map((f) => ({ grupo: 'Consolidado de seguimiento', documento_id: null, version_id: f.version_id, nombre: f.documento, formato: 'XLSX', disponible: true, evidencias: [] as any[] }));
    const ficha = { fila, fecha_corte, documentos: [...documentos, ...(fila.valor?.procedencia === 'CONSOLIDADO' || fila.responsable?.procedencia === 'CONSOLIDADO' ? consolidado : [])], detalle_tecnico: detalle ? { resolucion: detalle.resolucion, lectura_asistida: detalle.lectura_asistida, sin_proceso_confirmado: detalle.sin_proceso_confirmado, cotizaciones_verificadas: detalle.cotizaciones } : null };
    this.cacheFichas.set(clave, { firma, en: Date.now(), ficha });
    return ficha;
  }
}
