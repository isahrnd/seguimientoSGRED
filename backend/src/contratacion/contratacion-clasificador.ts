import { procesoUnico } from './contratacion-identificadores';
export type CategoriaDoc =
  | 'NECESIDAD_ALCANCE'
  | 'COTIZACIONES'
  | 'ANALISIS_SECTOR'
  | 'CONTRATACION_ACTAS'
  | 'EJECUCION_SOPORTES'
  | 'RESOLUCION_DEMOLICION'
  | 'VISITA_SOPORTE_TECNICO'
  | 'COMPARATIVO_GENERAL'
  | 'ESTUDIO_MERCADO'
  | 'MATRIZ_CONTRATACION';

export const CATEGORIAS: Record<CategoriaDoc, string> = {
  NECESIDAD_ALCANCE: 'Necesidad y alcance',
  COTIZACIONES: 'Cotizaciones',
  ANALISIS_SECTOR: 'Análisis del sector',
  CONTRATACION_ACTAS: 'Contratación y actas',
  EJECUCION_SOPORTES: 'Ejecución y soportes',
  RESOLUCION_DEMOLICION: 'Resolución de demolición',
  VISITA_SOPORTE_TECNICO: 'Visitas y soportes técnicos',
  COMPARATIVO_GENERAL: 'Comparativos generales',
  ESTUDIO_MERCADO: 'Estudio de mercado',
  MATRIZ_CONTRATACION: 'Matriz de contratación',
};


export interface Clasificacion {
  categoria: CategoriaDoc | null;
  proceso: string | null;
  fecha: string | null; // YYYY-MM-DD
  objeto: string | null;
}

/** La transcripción es solo contexto funcional: no entra al índice ni a la importación. */
export function esTranscripcion(nombre: string): boolean {
  return /transcrip/i.test(nombre);
}

/**
 * Número de proceso (segmento .32.). Un número de contrato (.26.), de resolución (.21.) o de convenio (.27.) NO es un proceso, un número cuya etiqueta
 * contradice su segmento o con lectura dudosa queda sin resolver, y si el texto cita varios procesos distintos no se elige ninguno.
 */
export function extraerProceso(texto: string): string | null {
  return procesoUnico(texto || '');
}

export function extraerFecha(texto: string): string | null {
  const m = /Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(texto || '');
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d) ? null : `${y}-${mo}-${d}`;
}

export function extraerObjeto(texto: string): string | null {
  const m = /objeto\s+consiste\s+en\s+[“"]([^”"]{10,800})[”"]/i.exec((texto || '').replace(/\s+/g, ' '));
  return m ? m[1].trim() : null;
}

/** Reglas genéricas (sin casos particulares) sobre nombre y texto de la primera página. */
export function clasificar(nombre: string, textoPrimeraPagina: string): Clasificacion {
  const t = `${nombre}\n${textoPrimeraPagina}`;
  let categoria: CategoriaDoc | null = null;
  if (/estudio\s+de\s+mercado/i.test(nombre)) categoria = 'ESTUDIO_MERCADO';
  else if (/cuadro\s+comparativ|comparativ[oa]s?(?![a-z])/i.test(nombre)) categoria = 'COMPARATIVO_GENERAL';
  else if (/resoluci[oó]n.{0,60}demolici|demolici.{0,60}resoluci[oó]n/i.test(nombre)) categoria = 'RESOLUCION_DEMOLICION';
  else if (/evaluaci[oó]n\s+(?:de\s+)?(?:da[ñn]os\s+)?atc|(?<![a-z])atc(?![a-z])|informe\s+de\s+visita|visita\s+t[eé]cnica|soporte.{0,3}t[eé]cnico/i.test(nombre)) categoria = 'VISITA_SOPORTE_TECNICO';
  else if (/an[aá]lisis\s+del\s+sector/i.test(t)) categoria = 'ANALISIS_SECTOR';
  else if (/cotizaci[oó]n|propuesta\s+econ[oó]mica|oferta/i.test(nombre)) categoria = 'COTIZACIONES';
  else if (/contrato|resoluci[oó]n|adjudicaci|orden\s+de\s+proveedur|minuta|\bacta\b/i.test(nombre)) categoria = 'CONTRATACION_ACTAS';
  else if (/necesidad|alcance|estudios?\s+previos|concepto\s+t[eé]cnico|diagn[oó]stico/i.test(nombre)) categoria = 'NECESIDAD_ALCANCE';
  else if (/informe|ejecuci[oó]n|vales|cuenta\s+de\s+cobro|factura|registro\s+fotogr/i.test(nombre)) categoria = 'EJECUCION_SOPORTES';
  return {
    categoria,
    proceso: extraerProceso(t),
    fecha: extraerFecha(textoPrimeraPagina),
    objeto: extraerObjeto(textoPrimeraPagina),
  };
}
