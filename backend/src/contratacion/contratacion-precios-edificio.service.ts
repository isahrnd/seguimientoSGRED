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

  async vistaGeneral(): Promise<VistaGeneral> {
    const registrados = await this.prisma.contratacionEdificio.findMany({ orderBy: { nombre: 'asc' } });
    const consolidado = await this.consolidadoVigente();
    const cache = new Map<number, any>();
    const detalleProceso = async (id: number) => { if (!cache.has(id)) cache.set(id, await this.consulta.detalle(id)); return cache.get(id); };

    const filas: FilaEdificio[] = [];
    const revision: VistaGeneral['revision'] = [];
    for (const ed of registrados) {
      const det: any = await this.edificios.detalle(ed.id);
      const procesos: ProcesoEntrada[] = [];
      let porVincular = false;
      for (const pr of det.procesos as any[]) {
        const D: any = await detalleProceso(pr.id);
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
      const cons = consolidado.find((c) => c.edificio_id === ed.id) ?? null;
      const verificadas = (det.cotizaciones as any[]).map((c) => ({ version_id: c.soporte.version_id as number, proveedor: c.proveedor as string, importe: c.importe as number, base: c.base as string, total_oferta: c.total_oferta as number | null, fecha_oferta: c.fecha_oferta as string | null, edificio_id: ed.id }));
      const ofertas = ofertasDeLectura(det.lectura_asistida ?? [], { id: ed.id, nombre: ed.nombre }, verificadas);
      const fila = construirFila({
        edificio: { id: ed.id, nombre: ed.nombre, direccion: ed.direccion }, consolidado: cons, procesos,
        area_documentada: ap.estado === 'DOCUMENTADA' ? { valor: ap.valor, tipo: ap.tipo, cita: ap.cita, fuente: fuenteDe(ap.soporte) } : null,
        ofertas, contrato_por_vincular: porVincular, analisis_sector: (det.grupos as any[]).some((g) => g.codigo === 'ANALISIS_SECTOR' && g.documentos.length > 0),
      });
      filas.push(fila);
      if (ap.estado === 'CONFLICTO') revision.push({ tipo: 'Área en conflicto', edificio: ed.nombre, detalle: ap.motivo, fuente: null });
      for (const d of fila.diferencias) revision.push({ tipo: 'Diferencia entre fuentes', edificio: ed.nombre, detalle: d, fuente: null });
    }
    // Filas del consolidado sin edificio registrado inequívoco: se muestran por su propio nombre; no se crean edificios.
    for (const c of consolidado.filter((x) => x.edificio_id === null)) {
      filas.push(construirFila({ edificio: { id: null, nombre: c.nombre, direccion: c.direccion }, consolidado: c, procesos: [], area_documentada: null, ofertas: [], contrato_por_vincular: false, analisis_sector: false }));
      revision.push({ tipo: 'Edificio del consolidado sin edificio registrado', edificio: c.nombre, detalle: 'Se muestra con los datos del consolidado; no se ha vinculado a un edificio registrado.', fuente: c.fuentes.valor });
    }
    // Orden del reporte: primero los edificios del consolidado (en su orden), luego los demás por nombre.
    filas.sort((a, b) => (a.consolidado_id ?? 1e9) - (b.consolidado_id ?? 1e9) || a.nombre.localeCompare(b.nombre, 'es'));
    const cortes = consolidado.map((c) => c.fecha_corte).filter(Boolean) as string[];
    const fuentes = [...new Map(consolidado.map((c) => [c.fuentes.valor!.version_id!, { rotulo: 'Consolidado de seguimiento', version_id: c.fuentes.valor!.version_id!, documento: c.fuentes.valor!.documento! }])).values()];
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

  /** Ficha de un edificio (registrado `e<ID>` o fila del consolidado `c<ID>`): los datos de la vista más sus documentos de respaldo. */
  async ficha(clave: string) {
    const v = await this.vistaGeneral();
    const fila = v.filas.find((f) => f.clave === clave);
    if (!fila) return null;
    const detalle: any = fila.edificio_id !== null ? await this.edificios.detalle(fila.edificio_id) : null;
    const documentos = detalle ? (detalle.grupos as any[]).flatMap((g) => g.documentos.map((d: any) => ({ grupo: g.nombre, documento_id: d.documento_id, version_id: d.version_id, nombre: d.nombre, formato: d.formato, disponible: d.disponible, evidencias: d.evidencias }))) : [];
    const consolidado = v.fuentes.map((f) => ({ grupo: 'Consolidado de seguimiento', documento_id: null, version_id: f.version_id, nombre: f.documento, formato: 'XLSX', disponible: true, evidencias: [] as any[] }));
    return { fila, fecha_corte: v.fecha_corte, documentos: [...documentos, ...(fila.valor?.procedencia === 'CONSOLIDADO' || fila.responsable?.procedencia === 'CONSOLIDADO' ? consolidado : [])], detalle_tecnico: detalle ? { resolucion: detalle.resolucion, lectura_asistida: detalle.lectura_asistida, sin_proceso_confirmado: detalle.sin_proceso_confirmado, cotizaciones_verificadas: detalle.cotizaciones } : null };
  }
}
