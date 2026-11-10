/**
 * Sugerencias de clasificación con evidencia trazable. Una sugerencia orienta la búsqueda
 * y la revisión; NO confirma asociaciones ni modifica importes.
 */
export type TipoSugerencia = 'CATEGORIA' | 'EDIFICACION' | 'EMPRESA' | 'RESOLUCION' | 'EXPEDIENTE';
export type FuenteSugerencia = 'CARPETA' | 'NOMBRE' | 'PDF_PAGINA' | 'XLSX_CELDA' | 'RESOLUCION_CITADA' | 'REVISION_PRIVADA';

export interface Sugerencia {
  tipo: TipoSugerencia;
  valor: string;
  fuente_tipo: FuenteSugerencia;
  fuente_detalle: string;
}

export interface EntradaSugerencias {
  ruta: string | null; // ruta relativa con '/' (carpetas + archivo)
  nombre: string;
  paginas?: { pagina: number; texto: string }[];
  celdas?: { ref: string; texto: string }[];
  edificacionesConocidas: string[];
}

/** Minúsculas, sin tildes y con espacios colapsados: base de toda búsqueda. */
export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ.\-/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const sinNumeracion = (s: string) => s.replace(/^\s*\d+\s*[.\-)]\s*/, '').trim();
const sinExtension = (s: string) => s.replace(/\.(pdf|xlsx|xls|docx?)$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();

export function edificacionDeCarpeta(ruta: string | null): string | null {
  const partes = (ruta ?? '').split('/').filter(Boolean);
  if (partes.length < 2) return null; // sin carpeta contenedora
  const v = sinNumeracion(partes[0]);
  return v.length >= 3 ? v : null;
}

const CATEGORIA_POR_TEXTO: Array<[RegExp, string]> = [
  [/cotizaci/i, 'COTIZACIONES'],
  [/estudio\s+de\s+mercado/i, 'ESTUDIO_MERCADO'],
  [/comparativ/i, 'COMPARATIVO_GENERAL'],
  [/resoluci[oó]n[^/]{0,60}demolici|demolici[^/]{0,60}resoluci[oó]n/i, 'RESOLUCION_DEMOLICION'],
  [/soporte.{0,3}t[eé]cnic|evaluaci[oó]n|(?<![a-z])atc(?![a-z])|atc.?20|post.?sismo|matriz ede|concepto t[eé]cnico|visita/i, 'VISITA_SOPORTE_TECNICO'],
  [/resoluci[oó]n/i, 'CONTRATACION_ACTAS'],
];

const RE_RESOLUCION = /Resoluci[oó]n\s+(?:No\.?\s*)?(\d{4}\.\d{3}\.\d{2}\.\d\.\d{3})\s*(?:de|-)\s*(\d{4})/i;

export function sugerir(e: EntradaSugerencias): Sugerencia[] {
  const out: Sugerencia[] = [];
  const add = (s: Sugerencia) => {
    if (!out.some((x) => x.tipo === s.tipo && x.valor === s.valor && x.fuente_tipo === s.fuente_tipo && x.fuente_detalle === s.fuente_detalle)) out.push(s);
  };
  const partes = (e.ruta ?? '').split('/').filter(Boolean);
  const carpetas = partes.slice(0, -1);

  const edif = edificacionDeCarpeta(e.ruta);
  if (edif) add({ tipo: 'EDIFICACION', valor: edif, fuente_tipo: 'CARPETA', fuente_detalle: carpetas[0] });

  // Categoría: primero por carpetas intermedias, luego por el nombre del archivo.
  for (const seg of carpetas.slice(1)) {
    for (const [re, cat] of CATEGORIA_POR_TEXTO) if (re.test(seg)) add({ tipo: 'CATEGORIA', valor: cat, fuente_tipo: 'CARPETA', fuente_detalle: seg });
  }
  for (const [re, cat] of CATEGORIA_POR_TEXTO) if (re.test(e.nombre)) add({ tipo: 'CATEGORIA', valor: cat, fuente_tipo: 'NOMBRE', fuente_detalle: e.nombre });

  // Empresa: solo orienta; el nombre por sí solo no identifica la intervención.
  const enCotizaciones = carpetas.slice(1).some((s) => /cotizaci/i.test(s));
  if (enCotizaciones) {
    const stem = sinNumeracion(sinExtension(e.nombre));
    if (stem.length >= 3 && !/propuesta|cotizaci|econ[oó]mic/i.test(stem)) add({ tipo: 'EMPRESA', valor: stem, fuente_tipo: 'NOMBRE', fuente_detalle: e.nombre });
  }

  // Resolución citada en el nombre o en el texto.
  const mNombre = /(\d{4}\.\d{3}\.\d{2}\.\d\.\d{3})\s*(?:de|-)\s*(\d{4})/i.exec(e.nombre);
  if (mNombre && /resoluci/i.test(e.nombre)) add({ tipo: 'RESOLUCION', valor: `${mNombre[1]}-${mNombre[2]}`, fuente_tipo: 'NOMBRE', fuente_detalle: e.nombre });
  for (const p of e.paginas ?? []) {
    const m = RE_RESOLUCION.exec(p.texto.replace(/\s+/g, ' '));
    if (m) add({ tipo: 'RESOLUCION', valor: `${m[1]}-${m[2]}`, fuente_tipo: 'PDF_PAGINA', fuente_detalle: `pág. ${p.pagina}` });
  }

  // Menciones de edificaciones conocidas (no implican que pertenezcan al mismo contrato).
  const conocidas = e.edificacionesConocidas.map((v) => ({ v, n: normalizar(v) })).filter((x) => x.n.length >= 5);
  const contiene = (texto: string, n: string) => (` ${normalizar(texto)} `).includes(` ${n} `) || normalizar(texto).includes(n);
  for (const k of conocidas) {
    for (const p of e.paginas ?? []) if (contiene(p.texto, k.n)) add({ tipo: 'EDIFICACION', valor: k.v, fuente_tipo: 'PDF_PAGINA', fuente_detalle: `pág. ${p.pagina}` });
    for (const c of e.celdas ?? []) if (contiene(c.texto, k.n)) add({ tipo: 'EDIFICACION', valor: k.v, fuente_tipo: 'XLSX_CELDA', fuente_detalle: c.ref });
  }
  return out;
}
