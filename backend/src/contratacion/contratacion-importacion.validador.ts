/**
 * Validación pura (sin BD) del archivo de importación. Una carga con cualquier
 * error no se aplica: ni parcialmente.
 *
 * Forma (versión 1):
 * { version: 1, expedientes: [{ proceso, intervencion, objeto?, fecha_documento?,
 *     hechos[], ofertas[], lineas[], referencias[], valores[], contratos[] }] }
 * Toda cifra lleva `fuente: { documento: <md5 de la versión>, pagina? }`.
 */
export const ACTIVIDADES = ['DEMOLICION', 'REPIQUE', 'CARGUE', 'RETIRO', 'TRANSPORTE', 'DISPOSICION_RCD', 'GESTION_INTEGRAL', 'OTRO'] as const;
export const UNIDADES = ['M3', 'M2', 'H_EQUIPO', 'VIAJE', 'GLOBAL', 'UND'] as const;
export const BASES = ['COSTO_DIRECTO', 'AIU', 'IMPUESTOS', 'TOTAL'] as const;
export const TIPOS_HECHO = ['EDIFICACION', 'ACTIVIDAD', 'PARTICULARIDAD', 'FACTOR', 'EXCLUSION', 'PENDIENTE_ACLARACION', 'REFERENCIA_FINANCIERA', 'JUSTIFICACION_SELECCION', 'FILA_COMPARATIVO', 'SECTOR', 'REPORTADO_CONTRATADO'] as const;
export const ALCANCES_CONFIRMADOS = ['DEMOLICION', 'RCD_SIN_DEMOLICION'] as const;
export const ALCANCES_DOCUMENTO = ['EDIFICIO', 'PROCESO', 'GENERAL'] as const;
const RE_CELDA = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/;
const RE_NUM_RESOLUCION = /^\d{4}\.\d{3}\.\d{2}\.\d\.\d{3}-\d{4}$/;
export const TIPOS_VALOR = ['PRESUPUESTO_OFICIAL', 'COTIZADO', 'EJECUTADO'] as const;
export const SOPORTES_VALOR = ['RESPALDADO', 'CITADO_SIN_ACTA'] as const;

export interface Fuente { documento: string; pagina?: number | null; hoja?: string | null; celda?: string | null }

export const TIPOS_CONFIRMACION = ['CATEGORIA', 'EDIFICACION', 'EMPRESA', 'RESOLUCION', 'EXPEDIENTE', 'ALCANCE'] as const;
export const CATEGORIAS_VALIDAS = ['NECESIDAD_ALCANCE', 'COTIZACIONES', 'ANALISIS_SECTOR', 'CONTRATACION_ACTAS', 'EJECUCION_SOPORTES', 'RESOLUCION_DEMOLICION', 'VISITA_SOPORTE_TECNICO', 'COMPARATIVO_GENERAL', 'ESTUDIO_MERCADO'] as const;

export interface ImportacionValidada {
  expedientes: any[];
  documentos: any[];
  edificios: any[];
  resoluciones: any[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function validarImportacion(payload: any): { errores: string[]; advertencias: string[]; datos: ImportacionValidada | null } {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const err = (m: string) => errores.push(m);

  if (!payload || typeof payload !== 'object' || payload.version !== 1 || (payload.expedientes !== undefined && !Array.isArray(payload.expedientes)) || (payload.documentos !== undefined && !Array.isArray(payload.documentos)) || (payload.edificios !== undefined && !Array.isArray(payload.edificios)) || (payload.resoluciones !== undefined && !Array.isArray(payload.resoluciones))) {
    return { errores: ['Formato inválido: se espera { version: 1, expedientes?, documentos?, edificios?, resoluciones? } con listas'], advertencias, datos: null };
  }
  payload.expedientes = payload.expedientes ?? [];
  payload.documentos = payload.documentos ?? [];
  payload.edificios = payload.edificios ?? [];
  payload.resoluciones = payload.resoluciones ?? [];
  if (payload.expedientes.length === 0 && payload.documentos.length === 0 && payload.edificios.length === 0 && payload.resoluciones.length === 0) err('La carga no contiene expedientes ni documentos');

  const fuenteOk = (f: any, ctx: string, obligatoria: boolean) => {
    if (f === undefined || f === null) { if (obligatoria) err(`${ctx}: falta la fuente documental`); return; }
    if (typeof f.documento !== 'string' || !/^[a-f0-9]{32}$/i.test(f.documento)) err(`${ctx}: fuente.documento debe ser el md5 de la versión`);
    if (f.pagina != null && (!Number.isInteger(f.pagina) || f.pagina < 1)) err(`${ctx}: fuente.pagina inválida`);
    if ((f.hoja != null || f.celda != null) && (typeof f.hoja !== 'string' || !f.hoja.trim() || typeof f.celda !== 'string' || !RE_CELDA.test(f.celda))) err(`${ctx}: la fuente de hoja requiere hoja y celda válida (p. ej. "Hoja1" y "D12")`);
  };
  const claves = (arr: any[], ctx: string) => {
    const s = new Set<string>();
    for (const x of arr) {
      if (typeof x?.clave !== 'string' || !x.clave.trim()) err(`${ctx}: registro sin clave`);
      else if (s.has(x.clave)) err(`${ctx}: clave repetida "${x.clave}"`);
      else s.add(x.clave);
    }
    return s;
  };
  const numerico = (v: unknown, ctx: string, campo: string) => {
    if (v === null || v === undefined) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) err(`${ctx}: ${campo} debe ser un número ≥ 0`);
  };

  const procesos = new Set<string>();
  for (const e of payload.expedientes) {
    const c = `Expediente ${e?.proceso ?? '?'}`;
    if (typeof e?.proceso !== 'string' || !/^\d{4}\.\d{3}\.\d{2}\.\d\.\d{3}-\d{4}$/.test(e.proceso)) { err(`${c}: proceso inválido`); continue; }
    if (procesos.has(e.proceso)) err(`${c}: repetido`);
    procesos.add(e.proceso);
    if (typeof e.intervencion !== 'string' || !e.intervencion.trim()) err(`${c}: falta intervencion`);
    if (e.fecha_documento && isNaN(Date.parse(e.fecha_documento))) err(`${c}: fecha_documento inválida`);
    if (e.alcance_confirmado != null && !ALCANCES_CONFIRMADOS.includes(e.alcance_confirmado)) err(`${c}: alcance_confirmado inválido`);
    if (e.edificios !== undefined && (!Array.isArray(e.edificios) || e.edificios.some((x: any) => typeof x !== 'string' || !x.trim()))) err(`${c}: edificios debe ser una lista de nombres`);
    e.edificios = Array.isArray(e.edificios) ? e.edificios : [];
    for (const k of ['hechos', 'ofertas', 'lineas', 'referencias', 'valores', 'contratos']) {
      if (e[k] !== undefined && !Array.isArray(e[k])) err(`${c}: ${k} debe ser una lista`);
      e[k] = Array.isArray(e[k]) ? e[k] : [];
    }

    for (const h of e.hechos) {
      if (!TIPOS_HECHO.includes(h.tipo)) err(`${c} hecho ${h.clave}: tipo inválido`);
      if (!h.titulo) err(`${c} hecho ${h.clave}: falta titulo`);
      fuenteOk(h.fuente, `${c} hecho ${h.clave}`, true);
    }
    claves(e.hechos, `${c} hechos`);

    const ofertas = claves(e.ofertas, `${c} ofertas`);
    for (const o of e.ofertas) {
      if (!o.proveedor || !o.grupo_oferta) err(`${c} oferta ${o.clave}: faltan proveedor o grupo_oferta`);
      if (o.revision != null && (!Number.isInteger(o.revision) || o.revision < 1)) err(`${c} oferta ${o.clave}: revision inválida`);
      if (o.fecha_oferta && isNaN(Date.parse(o.fecha_oferta))) err(`${c} oferta ${o.clave}: fecha_oferta inválida`);
      fuenteOk(o.fuente, `${c} oferta ${o.clave}`, true);
    }

    claves(e.lineas, `${c} lineas`);
    for (const l of e.lineas) {
      const lc = `${c} línea ${l.clave}`;
      if (!ACTIVIDADES.includes(l.actividad)) err(`${lc}: actividad inválida`);
      if (!UNIDADES.includes(l.unidad)) err(`${lc}: unidad inválida`);
      if (!BASES.includes(l.base_economica)) err(`${lc}: base_economica inválida`);
      if (l.oferta && !ofertas.has(l.oferta)) err(`${lc}: oferta "${l.oferta}" no existe`);
      for (const f of ['cantidad', 'precio_unitario', 'total']) numerico(l[f], lc, f);
      fuenteOk(l.fuente, lc, true);
      const q = num(l.cantidad), p = num(l.precio_unitario), t = num(l.total);
      if (q != null && p != null && t != null && Math.abs(q * p - t) > Math.max(2, t * 0.0005)) {
        advertencias.push(`${lc}: cantidad × precio no coincide con el total; revisar (${l.estado_revision ?? 'VERIFICADO'})`);
      }
    }

    claves(e.referencias, `${c} referencias`);
    for (const r of e.referencias) {
      if (!r.entidad || !r.objeto) err(`${c} referencia ${r.clave}: faltan entidad u objeto`);
      numerico(r.valor, `${c} referencia ${r.clave}`, 'valor');
      fuenteOk(r.fuente, `${c} referencia ${r.clave}`, true);
    }

    claves(e.valores, `${c} valores`);
    for (const v of e.valores) {
      const vc = `${c} valor ${v.clave}`;
      if (v.tipo === 'CONTRATADO') err(`${vc}: un valor contratado solo se registra en "contratos" con su acto soporte`);
      else if (!TIPOS_VALOR.includes(v.tipo)) err(`${vc}: tipo inválido`);
      if (!SOPORTES_VALOR.includes(v.estado_soporte ?? 'RESPALDADO')) err(`${vc}: estado_soporte inválido`);
      if (typeof v.importe !== 'number' || !(v.importe >= 0)) err(`${vc}: importe inválido`);
      if (v.oferta && !ofertas.has(v.oferta)) err(`${vc}: oferta "${v.oferta}" no existe`);
      fuenteOk(v.fuente, vc, true);
    }

    claves(e.contratos, `${c} contratos`);
    for (const k of e.contratos) {
      const kc = `${c} contrato ${k.clave}`;
      if (!k.tipo_acto) err(`${kc}: falta tipo_acto`);
      if (typeof k.valor !== 'number' || !(k.valor > 0)) err(`${kc}: valor inválido`);
      if (k.oferta && !ofertas.has(k.oferta)) err(`${kc}: oferta "${k.oferta}" no existe`);
      fuenteOk(k.fuente, kc, true); // sin soporte documental no hay contrato
    }
  }
  const nombresEdif = new Set<string>();
  for (const b of payload.edificios) {
    if (typeof b?.nombre !== 'string' || b.nombre.trim().length < 3) { err('Edificio sin nombre válido'); continue; }
    if (nombresEdif.has(b.nombre.trim().toLowerCase())) err(`Edificio repetido: ${b.nombre}`);
    nombresEdif.add(b.nombre.trim().toLowerCase());
  }
  const numerosRes = new Set<string>();
  for (const r of payload.resoluciones) {
    const rc = `Resolución ${r?.numero ?? '?'}`;
    if (typeof r?.numero !== 'string' || !RE_NUM_RESOLUCION.test(r.numero)) { err(`${rc}: número inválido (formato 4163.010.32.1.123-2026)`); continue; }
    if (numerosRes.has(r.numero)) err(`${rc}: repetida`);
    numerosRes.add(r.numero);
    if (r.fecha && isNaN(Date.parse(r.fecha))) err(`${rc}: fecha inválida`);
    if (!Array.isArray(r.edificios) || r.edificios.length === 0 || r.edificios.some((x: any) => typeof x !== 'string' || !x.trim())) err(`${rc}: debe indicar el edificio o edificios que identifica`);
    const estado = r.estado_verificacion ?? 'VERIFICADA';
    if (!['VERIFICADA', 'CITADA_SIN_ACTA'].includes(estado)) err(`${rc}: estado_verificacion inválido`);
    fuenteOk(r.fuente, rc, estado === 'VERIFICADA'); // verificada exige el documento
  }
  // Confirmaciones de revisión documental (asociaciones verificadas por una persona).
  const vistos = new Set<string>();
  for (const d of payload.documentos) {
    const dc = `Documento ${d?.documento ?? '?'}`;
    if (typeof d?.documento !== 'string' || !/^[a-f0-9]{32}$/i.test(d.documento)) { err(`${dc}: debe identificarse por el md5 de su versión`); continue; }
    if (vistos.has(d.documento.toLowerCase())) err(`${dc}: repetido`);
    vistos.add(d.documento.toLowerCase());
    if (!Array.isArray(d.confirmaciones) || d.confirmaciones.length === 0) err(`${dc}: sin confirmaciones`);
    for (const c of d.confirmaciones ?? []) {
      if (!TIPOS_CONFIRMACION.includes(c?.tipo)) err(`${dc}: tipo de confirmación inválido`);
      else if (typeof c.valor !== 'string' || !c.valor.trim()) err(`${dc}: confirmación sin valor`);
      else if (c.tipo === 'CATEGORIA' && !CATEGORIAS_VALIDAS.includes(c.valor)) err(`${dc}: categoría inválida`);
      else if (c.tipo === 'EXPEDIENTE' && !/^\d{4}\.\d{3}\.\d{2}\.\d\.\d{3}-\d{4}$/.test(c.valor)) err(`${dc}: el expediente se indica por su número de proceso`);
      else if (c.tipo === 'ALCANCE' && !ALCANCES_DOCUMENTO.includes(c.valor)) err(`${dc}: alcance inválido (EDIFICIO, PROCESO o GENERAL)`);
      if (c?.evidencia !== undefined && (typeof c.evidencia !== 'string' || !c.evidencia.trim() || c.evidencia.length > 400)) err(`${dc}: la evidencia debe ser un texto de hasta 400 caracteres`);
    }
  }
  return { errores, advertencias, datos: errores.length ? null : { expedientes: payload.expedientes, documentos: payload.documentos, edificios: payload.edificios, resoluciones: payload.resoluciones } };
}
