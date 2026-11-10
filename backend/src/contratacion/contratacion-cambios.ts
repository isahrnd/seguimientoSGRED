/**
 * Seguimiento de cifras cuando llega una versión nueva de un archivo.
 * - Celda de Excel sin cambios: la cifra se vuelve a vincular a la versión nueva (queda auditada).
 * - Celda de Excel con otro valor: la cifra conserva la versión anterior y se señala para revisión.
 * - PDF con contenido distinto: las cifras que citan una página se señalan para verificar esa página.
 */
export const MODELOS_CON_FUENTE = [
  { entidad: 'hecho', model: 'contratacionHecho' },
  { entidad: 'oferta', model: 'contratacionOferta' },
  { entidad: 'linea', model: 'contratacionLinea' },
  { entidad: 'referencia', model: 'contratacionReferencia' },
  { entidad: 'valor', model: 'contratacionValor' },
  { entidad: 'contrato', model: 'contratacionContrato' },
] as const;

export interface RegistroConFuente { entidad: string; id: number; clave: string; expediente_id: number; hoja: string | null; celda: string | null; pagina: number | null }

export type Decision =
  | { accion: 'REVINCULAR' }
  | { accion: 'ALERTAR'; valor_anterior: string | null; valor_nuevo: string | null };

/** Decide qué hacer con una cifra respaldada por una celda cuando se conoce su valor anterior y el nuevo. */
export function decidirCelda(anterior: string | null, nuevo: string | null): Decision {
  return (anterior ?? '') === (nuevo ?? '') ? { accion: 'REVINCULAR' } : { accion: 'ALERTAR', valor_anterior: anterior, valor_nuevo: nuevo };
}
