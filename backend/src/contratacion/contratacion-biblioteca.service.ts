import { HttpException, HttpStatus, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { CATEGORIAS } from './contratacion-clasificador';
import { driveAbrirDirecto } from './contratacion.config';
import { ContratacionDocumentosService } from './contratacion-documentos.service';
import { MAX_BYTES_EXCEL, leerHoja } from './contratacion-excel';
import { normalizar } from './contratacion-sugerencias';

export interface FiltrosBiblioteca {
  vista?: string; // todos | revisar | clasificados
  q?: string;
  categoria?: string;
  formato?: string;
  edificacion?: string;
  origen?: string;
  expediente?: string;
  pagina?: number;
  tam?: number;
}

type Formato = 'PDF' | 'XLSX' | 'OTRO';
const formatoDe = (mime: string | null | undefined): Formato => (mime === 'application/pdf' ? 'PDF' : mime?.includes('spreadsheetml') ? 'XLSX' : 'OTRO');

@Injectable()
export class ContratacionBibliotecaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentos: ContratacionDocumentosService,
  ) {}

  private async cargar() {
    return this.prisma.contratacionDocumento.findMany({
      include: {
        expediente: { select: { id: true, proceso: true, intervencion: true } },
        sugerencias: true,
        edificios: { include: { edificio: true } },
        versiones: { orderBy: { numero: 'desc' }, include: { origenes: true, indice: { select: { texto: true } } } },
      },
      orderBy: [{ creado_en: 'asc' }, { id: 'asc' }],
    });
  }

  private forma(d: any) {
    const vig = d.versiones.find((v: any) => v.vigente) ?? d.versiones[0];
    const origenes = (vig?.origenes ?? []).map((o: any) => ({ tipo: o.tipo, estado: o.estado, ruta: o.ruta, mime: o.mime }));
    const activos = origenes.filter((o: any) => o.estado === 'ACTIVO');
    const ref = activos[0] ?? origenes[0];
    const formato = formatoDe(ref?.mime);
    const partes = (ref?.ruta ?? '').split('/').filter(Boolean);
    const carpeta = partes.length > 1 ? partes.slice(0, -1).join(' / ') : null;
    const sug = (tipo: string) => d.sugerencias.filter((s: any) => s.tipo === tipo && s.estado !== 'DESCARTADA');
    const unicos = (tipo: string) => {
      const m = new Map<string, any>();
      for (const s of sug(tipo)) {
        const k = normalizar(s.valor);
        const previo = m.get(k);
        if (!previo || (s.estado === 'CONFIRMADA' && previo.estado !== 'CONFIRMADA')) m.set(k, { valor: s.valor, estado: s.estado, evidencias: [] });
        m.get(k).evidencias.push({ fuente_tipo: s.fuente_tipo, fuente_detalle: s.fuente_detalle, estado: s.estado });
        if (s.estado === 'CONFIRMADA') m.get(k).estado = 'CONFIRMADA';
      }
      return [...m.values()];
    };
    const cats = unicos('CATEGORIA');
    const catConf = cats.find((c) => c.estado === 'CONFIRMADA');
    const catAuto = d.categoria !== 'SIN_CATEGORIA' ? d.categoria : null;
    const catSug = cats[0];
    const categoriaCodigo = catConf?.valor ?? catAuto ?? catSug?.valor ?? null;
    const categoria = categoriaCodigo
      ? { codigo: categoriaCodigo, nombre: (CATEGORIAS as any)[categoriaCodigo] ?? categoriaCodigo, origen: catConf ? 'confirmada' : catAuto ? 'detectada' : 'sugerida', evidencias: (catConf ?? catSug)?.evidencias ?? [] }
      : null;
    const edificaciones = unicos('EDIFICACION');
    const confirmado = d.estado_clasificacion === 'CONFIRMADO' || d.estado_clasificacion === 'ASOCIADO';
    const edificiosConfirmados = d.edificios.map((x: any) => ({ id: x.edificio.id, nombre: x.edificio.nombre }));
    const categoriaConfirmada = categoria?.origen === 'confirmada';
    const esGeneral = d.alcance === 'GENERAL' || categoria?.codigo === 'COMPARATIVO_GENERAL';
    // Un documento puede estar clasificado con edificio y categoría confirmados aunque su proceso siga pendiente.
    const clasificado = (!!d.expediente && confirmado) || (categoriaConfirmada && (edificiosConfirmados.length > 0 || (esGeneral && d.alcance === 'GENERAL')));
    const asociacionesFaltantes: string[] = [];
    if (!categoria || categoria.origen === 'sugerida') asociacionesFaltantes.push('Categoría por confirmar');
    if (!esGeneral && edificiosConfirmados.length === 0) asociacionesFaltantes.push('Edificio por confirmar');
    if (!esGeneral && !d.expediente) asociacionesFaltantes.push('Proceso contractual pendiente');
    return {
      documento_id: d.id,
      version_id: vig?.id ?? null,
      numero_version: vig?.numero ?? null,
      nombre: d.nombre,
      formato,
      vista_previa: activos.length === 0 ? null : formato === 'PDF' ? 'pdf' : formato === 'XLSX' ? 'hoja' : null,
      disponible: activos.length > 0,
      carpeta,
      origenes: [...new Map(origenes.map((o: any) => [`${o.tipo}-${o.estado}`, { tipo: o.tipo, estado: o.estado }])).values()],
      abrir_en_drive: driveAbrirDirecto() && activos.some((o: any) => o.tipo === 'DRIVE'),
      categoria,
      edificaciones,
      empresas: unicos('EMPRESA'),
      resoluciones: unicos('RESOLUCION'),
      expedientes_sugeridos: unicos('EXPEDIENTE'),
      alcance: d.alcance ?? null,
      es_general: esGeneral,
      edificios_confirmados: edificiosConfirmados,
      asociaciones_faltantes: asociacionesFaltantes,
      expediente: d.expediente ? { id: d.expediente.id, proceso: d.expediente.proceso, intervencion: d.expediente.intervencion, confirmado: d.estado_clasificacion === 'CONFIRMADO' } : null,
      clasificado,
      _texto: normalizar([vig?.indice?.texto ?? '', d.nombre, carpeta ?? '', d.expediente?.proceso ?? '', d.expediente?.intervencion ?? '', ...d.sugerencias.map((s: any) => s.valor)].join(' ')),
    };
  }

  async listar(f: FiltrosBiblioteca) {
    const todos = (await this.cargar()).map((d) => this.forma(d));
    const tokens = normalizar(f.q ?? '').split(' ').filter(Boolean);
    const cumpleBusqueda = (x: any) => tokens.every((t) => x._texto.includes(t));
    const sinVista = todos.filter(
      (x) =>
        cumpleBusqueda(x) &&
        (!f.categoria || x.categoria?.codigo === f.categoria) &&
        (!f.formato || x.formato === f.formato) &&
        (!f.origen || x.origenes.some((o: any) => o.tipo === f.origen)) &&
        (!f.edificacion || x.edificaciones.some((e: any) => normalizar(e.valor) === normalizar(f.edificacion!)) || x.edificios_confirmados.some((e: any) => normalizar(e.nombre) === normalizar(f.edificacion!))) &&
        (!f.expediente || String(x.expediente?.id) === f.expediente),
    );
    const conteos = {
      todos: sinVista.length,
      revisar: sinVista.filter((x) => !x.clasificado).length,
      clasificados: sinVista.filter((x) => x.clasificado).length,
      generales: sinVista.filter((x) => x.es_general).length,
    };
    const vista = f.vista === 'revisar' || f.vista === 'clasificados' || f.vista === 'generales' ? f.vista : 'todos';
    const filtrados = sinVista.filter((x) => (vista === 'revisar' ? !x.clasificado : vista === 'clasificados' ? x.clasificado : vista === 'generales' ? x.es_general : true));
    const faceta = (extraer: (x: any) => { k: string; etiqueta: string }[]) => {
      const m = new Map<string, { valor: string; nombre: string; n: number }>();
      for (const x of filtrados) for (const e of extraer(x)) { const a = m.get(e.k) ?? { valor: e.k, nombre: e.etiqueta, n: 0 }; a.n++; m.set(e.k, a); }
      return [...m.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
    };
    const tam = Math.min(Math.max(f.tam ?? 50, 1), 100);
    const pagina = Math.max(f.pagina ?? 1, 1);
    return {
      vista,
      conteos,
      total: filtrados.length,
      pagina,
      tam,
      items: filtrados.slice((pagina - 1) * tam, pagina * tam).map(({ _texto, ...x }) => x),
      facetas: {
        categorias: faceta((x) => (x.categoria ? [{ k: x.categoria.codigo, etiqueta: x.categoria.nombre }] : [])),
        formatos: faceta((x) => [{ k: x.formato, etiqueta: x.formato === 'XLSX' ? 'Hoja de cálculo' : x.formato }]),
        edificaciones: faceta((x) => x.edificaciones.map((e: any) => ({ k: e.valor, etiqueta: e.valor }))),
        origenes: faceta((x) => x.origenes.map((o: any) => ({ k: o.tipo, etiqueta: o.tipo === 'LOCAL' ? 'Carpeta local' : 'Google Drive' }))),
      },
    };
  }

  /** Vista previa privada por hoja: celdas como datos, sin fórmulas, macros ni enlaces. */
  async hoja(versionId: number, indice: number) {
    const v = await this.prisma.contratacionDocumentoVersion.findUnique({ where: { id: versionId }, include: { documento: true, origenes: { where: { estado: 'ACTIVO' } } } });
    if (!v || v.origenes.length === 0) throw new HttpException('Documento no disponible en ninguna fuente autorizada', HttpStatus.NOT_FOUND);
    if (!v.origenes.some((o) => o.mime?.includes('spreadsheetml'))) throw new UnsupportedMediaTypeException('Sin vista previa de hoja para este formato');
    const { buf, origen } = await this.documentos.leerBytes(versionId, MAX_BYTES_EXCEL);
    try {
      const r = await leerHoja(buf, Number.isInteger(indice) && indice >= 0 ? indice : 0);
      if (!r.hoja) throw new HttpException('La hoja solicitada no existe', HttpStatus.NOT_FOUND);
      return { documento: v.documento.nombre, numero_version: v.numero, origen, ...r };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new UnsupportedMediaTypeException('No fue posible leer este archivo; consúltelo en su fuente con sus permisos');
    }
  }
}
