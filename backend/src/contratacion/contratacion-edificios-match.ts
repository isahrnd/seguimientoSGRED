import { normalizar } from './contratacion-sugerencias';

/**
 * Compara el nombre de un edificio tal como aparece en una tabla de un documento con los edificios registrados.
 * Solo orienta la revisión: una coincidencia aproximada NUNCA vincula ni confirma nada.
 */
export type CoincidenciaEdificio = 'COINCIDE' | 'POSIBLE' | 'SIN_COINCIDENCIA';

const GENERICAS = new Set(['ed', 'edificio', 'edificacion', 'conjunto', 'multifamiliar', 'centro', 'comercial', 'residencial', 'y', 'de', 'del', 'la', 'el', 'los', 'las']);

export const nucleo = (nombre: string) =>
  normalizar(nombre).replace(/[./-]/g, ' ').split(' ').filter((t) => t && !GENERICAS.has(t)).join('');

function bigramas(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice sobre bigramas de caracteres, en [0, 1]. */
export function similitud(a: string, b: string): number {
  const A = bigramas(a);
  const B = bigramas(b);
  if (!A.length || !B.length) return 0;
  const cuenta = new Map<string, number>();
  for (const x of B) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
  let comunes = 0;
  for (const x of A) { const n = cuenta.get(x) ?? 0; if (n > 0) { comunes++; cuenta.set(x, n - 1); } }
  return (2 * comunes) / (A.length + B.length);
}

export interface EdificioRegistrado { id: number; nombre: string; vinculado: boolean }
export interface ResultadoComparacion { estado: CoincidenciaEdificio; edificio_id: number | null; edificio: string | null; vinculado_al_documento: boolean | null; similitud: number }

export function compararEdificio(nombreEnTabla: string, registrados: EdificioRegistrado[]): ResultadoComparacion {
  const n = nucleo(nombreEnTabla);
  const ninguna: ResultadoComparacion = { estado: 'SIN_COINCIDENCIA', edificio_id: null, edificio: null, vinculado_al_documento: null, similitud: 0 };
  if (n.length < 4) return ninguna;
  let mejor: { r: EdificioRegistrado; s: number; exacta: boolean } | null = null;
  for (const r of registrados) {
    const m = nucleo(r.nombre);
    if (m.length < 4) continue;
    const exacta = normalizar(nombreEnTabla) === normalizar(r.nombre) || n === m;
    // Un nombre contenido en el otro («d corpus» dentro de «la fontaine d corpus») cuenta como parecido alto, no como igualdad.
    const contiene = n.length >= 5 && m.length >= 5 && (n.includes(m) || m.includes(n));
    const s = exacta ? 1 : Math.max(similitud(n, m), contiene ? 0.7 : 0);
    // Ante empates se prefiere el edificio ya vinculado al documento.
    if (!mejor || s > mejor.s || (s === mejor.s && r.vinculado && !mejor.r.vinculado)) mejor = { r, s, exacta };
  }
  if (!mejor || mejor.s < 0.6) return ninguna;
  return { estado: mejor.exacta ? 'COINCIDE' : 'POSIBLE', edificio_id: mejor.r.id, edificio: mejor.r.nombre, vinculado_al_documento: mejor.r.vinculado, similitud: Math.round(mejor.s * 100) / 100 };
}
