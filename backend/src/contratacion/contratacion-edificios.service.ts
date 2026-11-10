import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { CATEGORIAS } from './contratacion-clasificador';
import { ETIQUETA_REQUISITO, RequisitoResolucion, requisitoResolucion } from './contratacion-comparacion';
import { driveAbrirDirecto } from './contratacion.config';
import { normalizar } from './contratacion-sugerencias';
import { ContratacionCotizacionesEdificioService } from './contratacion-cotizaciones-edificio.service';

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);
const formatoDe = (mime: string | null | undefined) => (mime === 'application/pdf' ? 'PDF' : mime?.includes('spreadsheetml') ? 'XLSX' : 'OTRO');

/** Orden de los grupos de soportes en la ficha del edificio. */
const GRUPOS: Array<{ codigo: string; nombre: string }> = [
  { codigo: 'RESOLUCION_DEMOLICION', nombre: 'Resolución de demolición' },
  { codigo: 'VISITA_SOPORTE_TECNICO', nombre: 'Visitas y soportes técnicos' },
  { codigo: 'NECESIDAD_ALCANCE', nombre: 'Necesidad y alcance' },
  { codigo: 'COTIZACIONES', nombre: 'Cotizaciones y propuestas' },
  { codigo: 'ANALISIS_SECTOR', nombre: 'Análisis del sector' },
  { codigo: 'ESTUDIO_MERCADO', nombre: 'Estudio de mercado' },
  { codigo: 'CONTRATACION_ACTAS', nombre: 'Contratación y actas' },
  { codigo: 'EJECUCION_SOPORTES', nombre: 'Ejecución y soportes' },
  { codigo: 'COMPARATIVO_GENERAL', nombre: 'Comparativos generales' },
];

@Injectable()
export class ContratacionEdificiosService {
  private readonly cotizaciones = new ContratacionCotizacionesEdificioService(this.prisma);
  constructor(private readonly prisma: PrismaService) {}

  /** Soporte con página/hoja/celda, en la misma forma que usa el expediente. */
  private soporte(version: any, pagina: number | null, hoja: string | null = null, celda: string | null = null) {
    if (!version) return null;
    const vigente = version.documento?.versiones?.find((x: any) => x.vigente);
    return {
      version_id: version.id,
      documento_id: version.documento_id,
      documento: version.documento?.nombre ?? null,
      numero_version: version.numero,
      es_vigente: version.vigente,
      version_vigente_id: version.vigente ? null : vigente?.id ?? null,
      pagina,
      hoja,
      celda,
    };
  }

  /** Requisito de resolución y resoluciones registradas por edificio. */
  async requisitos(ids: number[]) {
    const out = new Map<number, { requisito: RequisitoResolucion; etiqueta: string; resoluciones: any[] }>();
    if (ids.length === 0) return out;
    const [enlaces, procesos] = await Promise.all([
      this.prisma.contratacionResolucionEdificio.findMany({
        where: { edificio_id: { in: ids } },
        include: { resolucion: { include: { version: { include: { documento: { include: { versiones: { select: { id: true, vigente: true } } } } } } } } },
      }),
      this.prisma.contratacionExpedienteEdificio.findMany({
        where: { edificio_id: { in: ids } },
        include: { expediente: { include: { hechos: { where: { tipo: 'ACTIVIDAD' }, select: { titulo: true } }, lineas: { select: { actividad: true } } } } },
      }),
    ]);
    for (const id of ids) {
      const res = enlaces.filter((x) => x.edificio_id === id).map((x) => x.resolucion);
      const ps = procesos.filter((x) => x.edificio_id === id).map((x) => ({
        alcance_confirmado: x.expediente.alcance_confirmado,
        actividades: [...x.expediente.hechos.map((h) => h.titulo), ...x.expediente.lineas.map((l) => l.actividad)],
      }));
      const verificadas = res.filter((r) => r.estado_verificacion === 'VERIFICADA' && r.version_id);
      const requisito = requisitoResolucion(ps, verificadas.length, res.length - verificadas.length);
      out.set(id, {
        requisito,
        etiqueta: ETIQUETA_REQUISITO[requisito],
        resoluciones: res.map((r) => ({
          numero: r.numero, fecha: d(r.fecha), tipo: r.tipo, estado_verificacion: r.estado_verificacion,
          estado_texto: r.estado_verificacion === 'VERIFICADA' ? 'Verificada con soporte' : 'Citada, pendiente de soporte',
          soporte: this.soporte(r.version, r.pagina),
        })),
      });
    }
    return out;
  }

  async listar(q?: string) {
    const edificios = await this.prisma.contratacionEdificio.findMany({
      include: {
        expedientes: { include: { expediente: { select: { id: true, proceso: true, intervencion: true } } } },
        documentos: { select: { documento_id: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    const tokens = normalizar(q ?? '').split(' ').filter(Boolean);
    const req = await this.requisitos(edificios.map((e) => e.id));
    const filas = edificios
      .filter((e) => tokens.every((t) => normalizar(`${e.nombre} ${e.direccion ?? ''} ${e.expedientes.map((x) => x.expediente.proceso).join(' ')}`).includes(t)))
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        direccion: e.direccion,
        procesos: e.expedientes.map((x) => ({ id: x.expediente.id, proceso: x.expediente.proceso, intervencion: x.expediente.intervencion })),
        documentos: e.documentos.length,
        resolucion: { requisito: req.get(e.id)!.requisito, etiqueta: req.get(e.id)!.etiqueta },
      }));
    return { edificios: filas, total: filas.length };
  }

  async detalle(id: number) {
    const e = await this.prisma.contratacionEdificio.findUnique({
      where: { id },
      include: {
        expedientes: { include: { expediente: { include: { contratos: { select: { id: true, valor: true, numero: true } }, ofertas: { select: { proveedor: true } }, edificios: { select: { edificio_id: true } } } } } },
        documentos: { include: { documento: { include: this.incluirDoc() } } },
      },
    });
    if (!e) throw new NotFoundException('Edificio no encontrado');
    const procesoIds = e.expedientes.map((x) => x.expediente_id);
    const docsProceso = procesoIds.length
      ? await this.prisma.contratacionDocumento.findMany({ where: { expediente_id: { in: procesoIds }, edificios: { none: {} } }, include: this.incluirDoc() })
      : [];
    const resolucion = (await this.requisitos([id])).get(id)!;
    const nn = normalizar(e.nombre);
    const forma = (doc: any, origen: 'DIRECTO' | 'PROCESO') => {
      const vig = doc.versiones.find((v: any) => v.vigente) ?? doc.versiones[0];
      const orig = vig?.origenes ?? [];
      const activos = orig.filter((o: any) => o.estado === 'ACTIVO');
      const ref = activos[0] ?? orig[0];
      const faltantes: string[] = [];
      if (!doc.expediente) faltantes.push('Proceso contractual');
      if (doc.categoria === 'SIN_CATEGORIA') faltantes.push('Categoría');
      return {
        documento_id: doc.id, version_id: vig?.id ?? null, nombre: doc.nombre,
        categoria: doc.categoria, categoria_nombre: (CATEGORIAS as any)[doc.categoria] ?? 'Sin categoría',
        formato: formatoDe(ref?.mime), disponible: activos.length > 0,
        vista_previa: activos.length === 0 ? null : formatoDe(ref?.mime) === 'PDF' ? 'pdf' : formatoDe(ref?.mime) === 'XLSX' ? 'hoja' : null,
        abrir_en_drive: driveAbrirDirecto() && activos.some((o: any) => o.tipo === 'DRIVE'),
        origen_asociacion: origen,
        proceso: doc.expediente ? { id: doc.expediente.id, proceso: doc.expediente.proceso } : null,
        fecha_documento: d(doc.fecha_documento),
        asociaciones_faltantes: faltantes,
        // Empresa confirmada para el documento (p. ej. el proveedor de una cotización) y la aclaración que la respalda.
        empresas: (doc.sugerencias ?? []).filter((s: any) => s.tipo === 'EMPRESA' && s.estado === 'CONFIRMADA').map((s: any) => ({ nombre: s.valor, aclaracion: s.fuente_tipo === 'ACLARACION' ? s.fuente_detalle : null })),
        // Dónde del documento se identifica este edificio (página, hoja y celda), cuando consta.
        evidencias: (doc.sugerencias ?? []).filter((s: any) => s.tipo === 'EDIFICACION' && s.estado !== 'DESCARTADA' && normalizar(s.valor) === nn && s.fuente_tipo !== 'REVISION_PRIVADA').map((s: any) => ({ fuente_tipo: s.fuente_tipo, detalle: s.fuente_detalle })),
      };
    };
    const items = [
      ...e.documentos.map((x) => forma(x.documento, 'DIRECTO')),
      ...docsProceso.map((x) => forma(x, 'PROCESO')),
    ];
    const vistos = new Set<number>();
    const unicos = items.filter((i) => (vistos.has(i.documento_id) ? false : (vistos.add(i.documento_id), true)));
    const grupos = [
      ...GRUPOS.map((g) => ({ ...g, documentos: unicos.filter((i) => i.categoria === g.codigo) })),
      { codigo: 'OTROS', nombre: 'Otros soportes', documentos: unicos.filter((i) => !GRUPOS.some((g) => g.codigo === i.categoria)) },
    ].filter((g) => g.documentos.length > 0);
    return {
      edificio: { id: e.id, nombre: e.nombre, direccion: e.direccion },
      procesos: e.expedientes.map((x) => ({
        id: x.expediente.id, proceso: x.expediente.proceso, intervencion: x.expediente.intervencion, estado_asociacion: x.estado,
        alcance_confirmado: x.expediente.alcance_confirmado,
        edificios_del_proceso: x.expediente.edificios.length,
        valor_contratado: x.expediente.contratos.length ? x.expediente.contratos.reduce((s, c) => s + Number(c.valor), 0) : null,
        nota_valor: x.expediente.edificios.length > 1 ? 'El valor contratado es del proceso completo y no se divide entre edificios.' : null,
      })),
      sin_proceso_confirmado: e.expedientes.length === 0,
      resolucion,
      grupos,
      cotizaciones: await this.cotizaciones.deEdificio(id),
      visitas_y_soportes_tecnicos: grupos.find((g) => g.codigo === 'VISITA_SOPORTE_TECNICO')?.documentos ?? [],
    };
  }

  private incluirDoc() {
    return {
      expediente: { select: { id: true, proceso: true } },
      sugerencias: true,
      versiones: { orderBy: { numero: 'desc' as const }, include: { origenes: true } },
    };
  }
}
