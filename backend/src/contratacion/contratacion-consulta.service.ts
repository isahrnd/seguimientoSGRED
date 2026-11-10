import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { CATEGORIAS } from './contratacion-clasificador';
import { compararConReferenciaGlobal, compararLineas } from './contratacion-comparador';
import { driveAbrirDirecto } from './contratacion.config';
import { ContratacionEdificiosService } from './contratacion-edificios.service';
import { diferenciasAlcance, diferenciasSinExplicar, valoresPorSignificado } from './contratacion-comparacion';
import { analizarPrecios, tipoIntervencion } from './contratacion-precios';
import { normalizar } from './contratacion-sugerencias';
import { ContratacionCotizacionesEdificioService } from './contratacion-cotizaciones-edificio.service';
import { vistaMatriz } from './contratacion-matriz-vista';
import { filaResumen } from './contratacion-resumen';
import { construirLibroResumen } from './contratacion-resumen-excel';

const n = (v: any): number | null => (v === null || v === undefined ? null : typeof v.toNumber === 'function' ? v.toNumber() : Number(v));
const formatoDe = (mime: string | null | undefined) => (mime === 'application/pdf' ? 'PDF' : mime?.includes('spreadsheetml') ? 'XLSX' : 'OTRO');
const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);

export interface FiltrosListado { q?: string; intervencion?: string; empresa?: string; estado?: string; desde?: string; hasta?: string }

@Injectable()
export class ContratacionConsultaService {
  constructor(private readonly prisma: PrismaService, private readonly edificios: ContratacionEdificiosService) {}

  private estadoDe(e: any): string {
    if (e.contratos.length) return 'CONTRATADO';
    if (e.valores.some((v: any) => v.tipo === 'EJECUTADO' && v.estado_soporte === 'RESPALDADO')) return 'EJECUCION_DOCUMENTADA';
    if (e.documentos.some((x: any) => x.categoria === 'ANALISIS_SECTOR')) return 'ANALISIS_DEL_SECTOR';
    return 'PENDIENTE_SOPORTE';
  }

  private fila(e: any) {
    const grupos = new Set(e.ofertas.map((o: any) => o.grupo_oferta));
    const cot = e.valores.filter((v: any) => v.tipo === 'COTIZADO').map((v: any) => n(v.importe) as number);
    const contratadoLista = e.contratos.map((c: any) => n(c.valor) as number);
    const ejec = e.valores.filter((v: any) => v.tipo === 'EJECUTADO' && v.estado_soporte === 'RESPALDADO').map((v: any) => n(v.importe) as number);
    const oficial = e.valores.find((v: any) => v.tipo === 'PRESUPUESTO_OFICIAL');
    const conOferta = e.contratos.find((c: any) => c.oferta_id);
    const seleccionada = conOferta ? e.ofertas.find((o: any) => o.id === conOferta.oferta_id)?.proveedor ?? null : null;
    const pendientes: string[] = [];
    if (!seleccionada) pendientes.push('Empresa seleccionada');
    if (!contratadoLista.length) pendientes.push('Contrato o acto de adjudicación');
    if (!cot.length) pendientes.push('Valor cotizado');
    if (!ejec.length) pendientes.push('Actas de ejecución');
    return {
      id: e.id,
      proceso: e.proceso,
      numero_contrato: e.numero_contrato ?? null,
      proceso_verificado: e.proceso_verificado !== false,
      intervencion: e.intervencion,
      edificaciones: e.hechos.filter((h: any) => h.tipo === 'EDIFICACION').map((h: any) => h.titulo),
      sectores: e.hechos.filter((h: any) => h.tipo === 'SECTOR').map((h: any) => h.titulo),
      tipo_intervencion: tipoIntervencion(e.intervencion),
      reportado_contratado: e.hechos.some((h: any) => h.tipo === 'REPORTADO_CONTRATADO'),
      empresa_seleccionada: seleccionada,
      ofertas_analizadas: [...new Set(e.ofertas.map((o: any) => o.proveedor))],
      estado: this.estadoDe(e),
      fecha_documento: d(e.fecha_documento),
      cotizaciones: grupos.size,
      valores: {
        presupuesto_oficial: oficial ? n(oficial.importe) : null,
        cotizado: cot.length ? { min: Math.min(...cot), max: Math.max(...cot) } : null,
        contratado: contratadoLista.length ? contratadoLista.reduce((a: number, b: number) => a + b, 0) : null,
        ejecutado: ejec.length ? ejec.reduce((a: number, b: number) => a + b, 0) : null,
      },
      valor_matriz: vistaMatriz(e.matriz_filas, e.contratos).valor_reportado,
      pendientes,
    };
  }

  private incluir() {
    return { documentos: { select: { categoria: true } }, hechos: true, ofertas: true, valores: true, contratos: true, matriz_filas: this.filasMatriz() } as const;
  }

  /** Filas de la matriz de contratación de la versión vigente del Excel, con su documento para citar la celda. */
  private filasMatriz() {
    return { where: { version: { vigente: true } }, include: { version: { include: { documento: true } } }, orderBy: [{ tipo_hoja: 'asc' as const }, { fila: 'asc' as const }] };
  }

  async listar(f: FiltrosListado) {
    const exps = await this.prisma.contratacionExpediente.findMany({ include: this.incluir(), orderBy: [{ fecha_documento: 'desc' }, { proceso: 'asc' }] });
    const q = f.q?.trim() ? normalizar(f.q) : '';
    const inter = f.intervencion?.trim().toLowerCase();
    const emp = f.empresa?.trim().toLowerCase();
    let filas = exps.map((e) => ({ e, r: this.fila(e) }));
    filas = filas.filter(({ e, r }) => {
      // Paridad ampliada: la búsqueda también cubre empresas (ofertas y seleccionada) y sectores, sin distinguir tildes.
      if (q) {
        const pajar = [r.proceso, r.intervencion, ...r.edificaciones, ...(r.sectores ?? []), ...(r.ofertas_analizadas ?? []), r.empresa_seleccionada ?? ''].map((x: string) => normalizar(x));
        if (!pajar.some((x) => x.includes(q))) return false;
      }
      if (inter && !r.intervencion.toLowerCase().includes(inter)) return false;
      if (emp && !e.ofertas.some((o: any) => o.proveedor.toLowerCase().includes(emp))) return false;
      if (f.estado && r.estado !== f.estado) return false;
      if (f.desde && (!r.fecha_documento || r.fecha_documento < f.desde)) return false;
      if (f.hasta && (!r.fecha_documento || r.fecha_documento > f.hasta)) return false;
      return true;
    });
    const rows = filas.map((x) => x.r);
    const contratos = filas.flatMap(({ e }) => e.contratos); // cada contrato una sola vez (id único)
    const unicos = new Map<number, number>(contratos.map((c: any) => [c.id, n(c.valor) as number]));
    const pendientesDocs = await this.prisma.contratacionDocumento.count({ where: { expediente_id: null, categoria: { not: 'MATRIZ_CONTRATACION' } } });
    return {
      expedientes: rows,
      totales: {
        expedientes: rows.length,
        contratado: unicos.size ? [...unicos.values()].reduce((a, b) => a + b, 0) : null,
        contratos: unicos.size,
      },
      documentos_pendientes_clasificacion: pendientesDocs,
      fuentes: await this.fuentes(),
    };
  }

  async fuentes() {
    const f = await this.prisma.contratacionFuenteEstado.findMany();
    const por = new Map(f.map((x) => [x.tipo, x]));
    const forma = (tipo: string) => {
      const x = por.get(tipo);
      return { tipo, estado: x?.estado ?? 'SIN_CONFIGURAR', ultima_correcta: x?.ultima_correcta ?? null, ultimo_intento: x?.ultimo_intento ?? null, total: x?.total ?? null, detalle: x?.detalle ?? null };
    };
    return [forma('LOCAL'), forma('DRIVE')];
  }

  private soporte(version: any, pagina: number | null, vigentePorDoc: Map<number, number>, hoja: string | null = null, celda: string | null = null) {
    if (!version) return null;
    return {
      version_id: version.id,
      documento_id: version.documento_id,
      documento: version.documento?.nombre ?? null,
      numero_version: version.numero,
      es_vigente: version.vigente,
      version_vigente_id: version.vigente ? null : vigentePorDoc.get(version.documento_id) ?? null,
      pagina,
      hoja,
      celda,
    };
  }

  async detalle(id: number) {
    const e = await this.prisma.contratacionExpediente.findUnique({
      where: { id },
      include: {
        documentos: { include: { edificios: { include: { edificio: true } }, versiones: { include: { origenes: true }, orderBy: { numero: 'asc' } } }, orderBy: { fecha_documento: 'asc' } },
        hechos: { include: { version: { include: { documento: true } } }, orderBy: { id: 'asc' } },
        ofertas: { include: { version: { include: { documento: true } } }, orderBy: [{ grupo_oferta: 'asc' }, { revision: 'asc' }] },
        lineas: { include: { version: { include: { documento: true } } }, orderBy: { id: 'asc' } },
        referencias: { include: { version: { include: { documento: true } } }, orderBy: { id: 'asc' } },
        valores: { include: { version: { include: { documento: true } } }, orderBy: { id: 'asc' } },
        contratos: { include: { version: { include: { documento: true } } }, orderBy: { id: 'asc' } },
        edificios: { include: { edificio: true } },
        alertas: { where: { estado: 'PENDIENTE' }, orderBy: { id: 'asc' } },
        matriz_filas: this.filasMatriz(),
      },
    });
    if (!e) throw new NotFoundException('Expediente no encontrado');

    const vigentePorDoc = new Map<number, number>();
    for (const doc of e.documentos) { const v = doc.versiones.find((x) => x.vigente); if (v) vigentePorDoc.set(doc.id, v.id); }
    const S = (x: any) => this.soporte(x.version, x.pagina, vigentePorDoc, x.hoja ?? null, x.celda ?? null);
    const ofertaPorId = new Map(e.ofertas.map((o) => [o.id, o]));

    // Una sola lista de soportes (documentos asociados), con orígenes sin exponer rutas ni enlaces.
    const soportes = e.documentos.map((doc) => {
      const vig = doc.versiones.find((v) => v.vigente) ?? doc.versiones[doc.versiones.length - 1];
      const origenes = doc.versiones.flatMap((v) => v.origenes.filter((o) => o.version_id === vig?.id));
      const activos = origenes.filter((o) => o.estado === 'ACTIVO');
      const esPdf = origenes.some((o) => o.mime === 'application/pdf');
      return {
        documento_id: doc.id,
        version_id: vig?.id ?? null,
        numero_version: vig?.numero ?? null,
        nombre: doc.nombre,
        categoria: doc.categoria,
        categoria_nombre: (CATEGORIAS as any)[doc.categoria] ?? 'Sin categoría',
        alcance: doc.alcance,
        edificios: doc.edificios.map((x: any) => ({ id: x.edificio.id, nombre: x.edificio.nombre })),
        fecha_documento: d(doc.fecha_documento),
        origenes: origenes.map((o) => ({ tipo: o.tipo, estado: o.estado, nombre_original: o.nombre_original })),
        disponible: activos.length > 0,
        formato: origenes.some((o) => o.mime === 'application/pdf') ? 'PDF' : origenes.some((o) => o.mime?.includes('spreadsheetml')) ? 'XLSX' : 'OTRO',
        previsualizable: esPdf && activos.length > 0,
        abrir_en_drive: driveAbrirDirecto() && activos.some((o) => o.tipo === 'DRIVE'),
        versiones: doc.versiones.map((v) => ({ version_id: v.id, numero: v.numero, vigente: v.vigente })),
      };
    });

    const lineas = e.lineas.map((l) => {
      const o = l.oferta_id ? ofertaPorId.get(l.oferta_id) : null;
      return {
        id: l.id, clave: l.clave, oferta_clave: o?.clave ?? null, proveedor: o?.proveedor ?? null,
        actividad: l.actividad, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad,
        precio_unitario: n(l.precio_unitario), total: n(l.total), base_economica: l.base_economica,
        grupo_comparacion: l.grupo_comparacion, derivado: l.derivado, estado_revision: l.estado_revision, nota: l.nota,
        soporte: S(l),
      };
    });

    // Comparación entre ofertas del expediente y contra referencias de mercado.
    const comparaciones: any[] = [];
    for (let i = 0; i < lineas.length; i++) {
      for (let j = i + 1; j < lineas.length; j++) {
        const a = lineas[i], b = lineas[j];
        if (a.oferta_clave && b.oferta_clave && a.oferta_clave !== b.oferta_clave && a.unidad !== 'GLOBAL') {
          comparaciones.push({ a: a.clave, b: b.clave, ...compararLineas(a, b) });
        }
      }
    }
    const refsConComparacion = e.referencias.map((r) => ({
      id: r.id, clave: r.clave, entidad: r.entidad, proveedor: r.proveedor, proceso_ref: r.proceso_ref, fecha: d(r.fecha),
      objeto: r.objeto, valor: n(r.valor), unidad: r.unidad, condiciones: r.condiciones, soporte: S(r),
      comparacion: compararConReferenciaGlobal(),
    }));

    const valores = e.valores.map((v) => ({
      id: v.id, clave: v.clave, tipo: v.tipo, concepto: v.concepto, importe: n(v.importe), estado_soporte: v.estado_soporte,
      oferta: v.oferta_id ? ofertaPorId.get(v.oferta_id)?.proveedor ?? null : null, soporte: S(v),
    }));
    const contratos = e.contratos.map((c) => ({
      id: c.id, clave: c.clave, tipo_acto: c.tipo_acto, numero: c.numero, fecha_acto: d(c.fecha_acto), alcance: c.alcance,
      justificacion: c.justificacion, valor: n(c.valor), oferta: c.oferta_id ? ofertaPorId.get(c.oferta_id)?.proveedor ?? null : null, soporte: S(c),
      contratista: (c as any).contratista ?? null, expresion_valor: (c as any).expresion_valor ?? null, firma_estado: (c as any).firma_estado ?? null,
      firma_detalle: (c as any).firma_detalle ?? null, firma_fecha: d((c as any).firma_fecha), numero_proceso_citado: (c as any).numero_proceso_citado ?? null,
    }));
    const fila = this.fila({ ...e, documentos: e.documentos });

    // ---- Comparación de cotizaciones (significado de cada valor, alcance, selección, estudio de mercado) ----
    const hechosDe = (tipo: string) => e.hechos.filter((h) => h.tipo === tipo);
    const justificaciones = hechosDe('JUSTIFICACION_SELECCION').map((h) => {
      const of = (h.atributos as any)?.oferta ? e.ofertas.find((o) => o.clave === (h.atributos as any).oferta) : null;
      return { oferta: of?.proveedor ?? null, texto: h.detalle ?? h.titulo, soporte: S(h) };
    });
    const significados = valoresPorSignificado({
      valores: valores.map((v) => ({ tipo: v.tipo, importe: v.importe, concepto: v.concepto, estado_soporte: v.estado_soporte, oferta: v.oferta, soporte: v.soporte as any })),
      contratos: contratos.map((c) => ({ valor: c.valor, tipo_acto: c.tipo_acto, oferta: c.oferta, soporte: c.soporte as any, alcance: c.alcance, numero: c.numero, contratista: c.contratista, expresion_valor: c.expresion_valor })),
      seleccionJustificada: justificaciones as any,
    });
    const alcance = diferenciasAlcance(e.ofertas.map((o) => ({ clave: o.clave, proveedor: o.proveedor, incluye: o.incluye, excluye: o.excluye, lineas: lineas.filter((l) => l.oferta_clave === o.clave).map((l) => ({ actividad: l.actividad, descripcion: l.descripcion })) })));
    const seleccionada = contratos.find((c) => c.oferta)?.oferta ?? justificaciones.find((j) => j.oferta)?.oferta ?? null;
    const estudios = e.documentos.filter((x) => x.categoria === 'ESTUDIO_MERCADO');
    const sector = e.documentos.filter((x) => x.categoria === 'ANALISIS_SECTOR');
    const docRef = (x: any) => ({ documento_id: x.id, nombre: x.nombre, version_id: (x.versiones.find((v: any) => v.vigente) ?? x.versiones[0])?.id ?? null });
    const filasComparativo = hechosDe('FILA_COMPARATIVO').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, atributos: h.atributos, soporte: S(h) }));
    // ---- Análisis de precios ----
    const valorOferta = (o: any): number | null => {
      const cs = e.valores.filter((v) => v.tipo === 'COTIZADO' && v.oferta_id === o.id);
      return cs.length === 1 ? n(cs[0].importe) : null;
    };
    const analisis_precios = analizarPrecios({
      contratos: contratos.map((c) => ({ valor: c.valor as number, tipo_acto: c.tipo_acto, numero: c.numero, oferta: c.oferta, soporte: c.soporte as any })),
      ofertas: e.ofertas.map((o) => ({ proveedor: o.proveedor, grupo_oferta: o.grupo_oferta, revision: o.revision, valor: valorOferta(o), soporte: S(o) as any })),
      presupuestoOficial: (() => { const p = valores.find((v) => v.tipo === 'PRESUPUESTO_OFICIAL'); return p ? { importe: p.importe as number, soporte: p.soporte as any } : null; })(),
      referenciasExternas: refsConComparacion.map((r) => ({ entidad: r.entidad, objeto: r.objeto, valor: r.valor, equivalente: false, motivo_no_comparable: r.comparacion.motivo ?? null, soporte: r.soporte as any })),
      alcance,
      seleccion: { oferta: seleccionada, justificada: justificaciones.length > 0 || contratos.some((c) => !!c.justificacion) },
      ejecutado: valores.filter((v) => v.tipo === 'EJECUTADO').map((v) => ({ importe: v.importe as number, respaldado: v.estado_soporte === 'RESPALDADO', soporte: v.soporte as any })),
      partidas: { comparadas: comparaciones.filter((c) => c.comparable).length, total: comparaciones.length },
    });
    const ids = e.edificios.map((x) => x.edificio_id);
    const req = await this.edificios.requisitos(ids);
    const edificiosProceso = e.edificios.map((x) => ({ id: x.edificio.id, nombre: x.edificio.nombre, direccion: x.edificio.direccion, estado_asociacion: x.estado, resolucion: req.get(x.edificio_id) ?? null }));
    const comparacion = {
      valores: significados,
      cotizaciones_resumen: e.ofertas.map((o) => ({
        clave: o.clave, proveedor: o.proveedor, es_seleccionada: o.proveedor === seleccionada,
        edificios_o_alcance: o.incluye, condiciones: o.notas, excluye: o.excluye,
        valor_cotizado: valores.filter((v) => v.tipo === 'COTIZADO' && v.oferta === o.proveedor).map((v) => ({ importe: v.importe, concepto: v.concepto, soporte: v.soporte })),
      })),
      alcance,
      seleccion: {
        estado: contratos.some((c) => c.oferta) ? 'ADJUDICADA' : justificaciones.length ? 'JUSTIFICADA_SIN_ACTO' : 'PENDIENTE_SOPORTE',
        oferta: seleccionada,
        justificaciones,
        texto: contratos.some((c) => c.oferta) ? null : justificaciones.length ? 'Hay una justificación documentada, pero aún no el acto de contratación.' : 'Pendiente de soporte: no hay contrato, acta ni justificación documentada de la selección.',
        contratos: contratos.filter((c) => c.justificacion).map((c) => ({ numero: c.numero, justificacion: c.justificacion, soporte: c.soporte })),
      },
      estudio_mercado: {
        estado: estudios.length ? 'RECIBIDO' : 'PENDIENTE_DE_RECIBIR',
        etiqueta: estudios.length ? 'Estudio de mercado incorporado' : 'Estudio de mercado pendiente de recibir',
        documentos: estudios.map(docRef),
        analisis_del_sector: sector.map(docRef),
        aviso: 'El análisis del sector y el estudio de mercado específico del equipo financiero son documentos distintos.',
      },
      diferencias_sin_explicar: diferenciasSinExplicar(significados, hechosDe('PENDIENTE_ACLARACION').map((h) => h.titulo)),
      comparativo_general: filasComparativo,
      alertas_cifra: e.alertas.map((a) => ({ id: a.id, entidad: a.entidad, clave: a.clave, hoja: a.hoja, celda: a.celda, valor_anterior: a.valor_anterior, valor_nuevo: a.valor_nuevo, version_anterior_id: a.version_anterior_id, version_nueva_id: a.version_nueva_id })),
    };
    // Documentos por edificio: los del proceso confirmados para ese edificio y los vinculados directamente al edificio
    // (visitas, soportes técnicos), aunque el proceso aún no esté confirmado para ellos. Sin duplicar el original.
    const enlaces = ids.length
      ? await this.prisma.contratacionDocumentoEdificio.findMany({ where: { edificio_id: { in: ids } }, include: { documento: { include: { versiones: { where: { vigente: true }, select: { id: true, origenes: { where: { estado: 'ACTIVO' }, select: { mime: true } } } } } } } })
      : [];
    const refDoc = (id: number, nombre: string, categoria: string, versionId: number | null, origen: string, formato = 'OTRO') => ({ documento_id: id, version_id: versionId, formato, vista_previa: formato === 'PDF' ? 'pdf' : formato === 'XLSX' ? 'hoja' : null, nombre, categoria, categoria_nombre: (CATEGORIAS as any)[categoria] ?? 'Sin categoría', origen });
    const porEdificio = [
      ...edificiosProceso.map((b) => {
        const delProceso = soportes.filter((s) => s.edificios.some((x: any) => x.id === b.id)).map((s) => refDoc(s.documento_id, s.nombre, s.categoria, s.version_id, 'PROCESO', s.formato));
        const idsProceso = new Set(delProceso.map((x) => x.documento_id));
        const directos = enlaces.filter((x) => x.edificio_id === b.id && !idsProceso.has(x.documento_id)).map((x) => refDoc(x.documento_id, x.documento.nombre, x.documento.categoria, x.documento.versiones[0]?.id ?? null, 'EDIFICIO', formatoDe(x.documento.versiones[0]?.origenes?.[0]?.mime)));
        return { edificio: { id: b.id, nombre: b.nombre }, documentos: [...delProceso, ...directos] };
      }),
      { edificio: null, documentos: soportes.filter((s) => s.edificios.length === 0).map((s) => refDoc(s.documento_id, s.nombre, s.categoria, s.version_id, 'PROCESO', s.formato)) },
    ];
    return {
      expediente: { ...fila, objeto: e.objeto },
      matriz: vistaMatriz(e.matriz_filas, e.contratos),
      necesidad: {
        edificaciones: e.hechos.filter((h) => h.tipo === 'EDIFICACION').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, atributos: h.atributos, soporte: S(h) })),
        actividades: e.hechos.filter((h) => h.tipo === 'ACTIVIDAD').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, soporte: S(h) })),
        particularidades: e.hechos.filter((h) => ['PARTICULARIDAD', 'EXCLUSION', 'REFERENCIA_FINANCIERA'].includes(h.tipo)).map((h) => ({ clave: h.clave, tipo: h.tipo, titulo: h.titulo, detalle: h.detalle, soporte: S(h) })),
        factores: e.hechos.filter((h) => h.tipo === 'FACTOR').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, atributos: h.atributos, soporte: S(h) })),
        pendientes_aclaracion: e.hechos.filter((h) => h.tipo === 'PENDIENTE_ACLARACION').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, soporte: S(h) })),
      },
      cotizaciones: e.ofertas.map((o) => ({
        id: o.id, clave: o.clave, proveedor: o.proveedor, grupo_oferta: o.grupo_oferta, revision: o.revision, fecha_oferta: d(o.fecha_oferta),
        incluye: o.incluye, excluye: o.excluye, notas: o.notas, soporte: S(o),
        lineas: lineas.filter((l) => l.oferta_clave === o.clave),
      })),
      lineas_sin_oferta: lineas.filter((l) => !l.oferta_clave),
      comparaciones_entre_ofertas: comparaciones,
      analisis_sector: { referencias: refsConComparacion },
      contratacion: { contratos, seleccion_documentada: contratos.length > 0, aviso: contratos.length ? null : 'Pendiente de soporte: un análisis del sector no acredita una firma ni una adjudicación.' },
      ejecucion: { valores: valores.filter((v) => v.tipo === 'EJECUTADO') },
      valores,
      soportes,
      edificios: edificiosProceso,
      // Cifras de cotizaciones atribuidas a los edificios del proceso (otras ofertas del mismo proveedor, de otra fecha o alcance).
      cotizaciones_edificio: await new ContratacionCotizacionesEdificioService(this.prisma).deEdificio(edificiosProceso.map((b) => b.id)),
      documentos_por_edificio: porEdificio,
      comparacion,
      analisis_precios,
      sectores: e.hechos.filter((h) => h.tipo === 'SECTOR').map((h) => ({ clave: h.clave, titulo: h.titulo, detalle: h.detalle, soporte: S(h) })),
    };
  }

  /** ¿Qué explica la diferencia entre dos intervenciones? Pareo por actividad con motivo explícito. */
  async comparar(a: number, b: number) {
    const [A, B] = await Promise.all([this.detalle(a), this.detalle(b)]);
    const lin = (D: any) => [...D.cotizaciones.flatMap((c: any) => c.lineas), ...D.lineas_sin_oferta].filter((l: any) => l.precio_unitario != null);
    const pares: any[] = [];
    for (const la of lin(A)) for (const lb of lin(B)) {
      if (la.actividad === lb.actividad || la.unidad === lb.unidad) pares.push({ a: la, b: lb, resultado: compararLineas(la, lb) });
    }
    if (pares.length === 0) {
      // Sin actividad ni unidad en común: se deja explícito por qué no hay comparación.
      const cab = (L: any[]) => L.find((l) => l.base_economica === 'TOTAL') ?? L[0];
      const la = cab(lin(A)), lb = cab(lin(B));
      if (la && lb) pares.push({ a: la, b: lb, resultado: compararLineas(la, lb) });
    }
    return {
      a: { id: A.expediente.id, proceso: A.expediente.proceso, intervencion: A.expediente.intervencion, factores: A.necesidad.factores, particularidades: A.necesidad.particularidades },
      b: { id: B.expediente.id, proceso: B.expediente.proceso, intervencion: B.expediente.intervencion, factores: B.necesidad.factores, particularidades: B.necesidad.particularidades },
      pares,
      aviso: 'La diferencia solo se expresa en porcentaje cuando actividad, alcance, unidad y tratamiento económico coinciden. No constituye un veredicto sobre sobrecostos.',
    };
  }

  /**
   * Vista «Análisis de precios»: lo contratado por intervención, con su resultado y lo que falta. Cada contrato cuenta una
   * sola vez; los casos reportados como contratados sin soporte no suman al total confirmado.
   */
  async analisisPrecios() {
    const exps = await this.prisma.contratacionExpediente.findMany({ select: { id: true }, orderBy: [{ fecha_documento: 'desc' }, { proceso: 'asc' }] });
    const detalles: any[] = await Promise.all(exps.map((x) => this.detalle(x.id)));
    const filas = detalles.map((D) => {
      const A = D.analisis_precios;
      const primerContrato = D.contratacion.contratos[0] ?? null;
      return {
        id: D.expediente.id, proceso: D.expediente.proceso, numero_contrato: D.expediente.numero_contrato, proceso_verificado: D.expediente.proceso_verificado, intervencion: D.expediente.intervencion, tipo_intervencion: D.expediente.tipo_intervencion,
        edificios: D.expediente.edificaciones, sectores: D.expediente.sectores,
        alcance: D.necesidad.actividades.map((a: any) => a.titulo),
        empresa_seleccionada: D.comparacion.seleccion.oferta,
        valor_contratado: A.contratado.sustentado ? A.contratado : null,
        soporte_contrato: primerContrato?.soporte ?? null,
        reportado_contratado: D.expediente.reportado_contratado,
        resultado: A.resultado, resumen: A.resumen, pendientes: A.pendientes, rango: A.rango,
        referencias_independientes: A.referencias.filter((r: any) => r.independiente && r.comparable && !r.es_la_seleccionada).length,
        ofertas: D.cotizaciones.length,
      };
    });
    // Cada contrato una sola vez (por id), solo con soporte; el izaje de grúas no se suma al total de demoliciones.
    const sumar = (cumple: (t: string) => boolean) => {
      const por = new Map<string, number>();
      for (const D of detalles) if (cumple(D.expediente.tipo_intervencion)) for (const c of D.contratacion.contratos) por.set(`${D.expediente.id}:${c.id}`, c.valor);
      return por.size ? [...por.values()].reduce((a, b) => a + b, 0) : null;
    };
    return {
      expedientes: filas,
      totales: { contratado_demoliciones: sumar((t) => t !== 'IZAJE_GRUAS'), contratado_izaje_gruas: sumar((t) => t === 'IZAJE_GRUAS'), con_contrato_soportado: filas.filter((f) => f.valor_contratado).length },
      pendientes_de_soporte: filas.filter((f) => !f.valor_contratado).map((f) => ({
        id: f.id, proceso: f.proceso, intervencion: f.intervencion, reportado_contratado: f.reportado_contratado,
        documento_necesario: `Contrato, acto de adjudicación u oferta aceptada firmada del proceso ${f.proceso}`,
      })),
      aviso: 'Los casos reportados como contratados que aún no tienen contrato o soporte equivalente no se incluyen en el total contratado confirmado.',
    };
  }

  /** Libro Excel «Resumen por contrato»: una fila por expediente, cada cifra con su fuente; matriz, contrato y ejecución en columnas separadas. */
  async resumenPorContrato(): Promise<Buffer> {
    const exps = await this.prisma.contratacionExpediente.findMany({ select: { id: true }, orderBy: [{ fecha_documento: 'desc' }, { proceso: 'asc' }] });
    const detalles: any[] = await Promise.all(exps.map((x) => this.detalle(x.id)));
    return construirLibroResumen(detalles.map(filaResumen));
  }

  async pendientes() {
    const docs = await this.prisma.contratacionDocumento.findMany({
      where: { expediente_id: null },
      include: { versiones: { where: { vigente: true }, include: { origenes: { where: { estado: 'ACTIVO' } } } } },
      orderBy: { creado_en: 'desc' },
    });
    return docs.map((x) => ({
      documento_id: x.id, nombre: x.nombre, categoria: x.categoria, proceso_detectado: x.proceso_detectado,
      categoria_nombre: (CATEGORIAS as any)[x.categoria] ?? 'Sin categoría',
      version_id: x.versiones[0]?.id ?? null,
      origenes: [...new Set((x.versiones[0]?.origenes ?? []).map((o) => o.tipo))],
      previsualizable: (x.versiones[0]?.origenes ?? []).some((o) => o.mime === 'application/pdf'),
    }));
  }
}
