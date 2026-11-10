/**
 * Superficies documentadas. Una superficie solo cuenta si un documento la declara de forma explícita («área construida de 320 m²»),
 * con su página, su cita y el edificio al que se refiere. Nunca se deduce de las cantidades de las partidas ni se elige por frecuencia.
 */
export type TipoArea = 'CONSTRUIDA' | 'INTERVENCION' | 'DEMOLICION' | 'LOTE' | 'OTRA';
/** Tipos que describen lo intervenido; el lote o terreno no sirve para un precio por m² de la intervención. */
export const TIPOS_APLICABLES: TipoArea[] = ['CONSTRUIDA', 'INTERVENCION', 'DEMOLICION'];

export interface AreaNativa { valor: number; tipo: TipoArea; pagina: number; cita: string }

/** Número escrito a la colombiana o a la inglesa → número; null si no es un número claro. */
export function parseNumero(t: string): number | null {
  const s = t.trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const p = s.lastIndexOf('.');
  const c = s.lastIndexOf(',');
  let limpio: string;
  if (p >= 0 && c >= 0) limpio = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) limpio = (s.match(/,/g) ?? []).length === 1 && /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (p >= 0) limpio = (s.match(/\./g) ?? []).length === 1 && !/\.\d{3}$/.test(s) ? s : s.replace(/\./g, '');
  else limpio = s;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const UNIDAD = String.raw`(?:m\s?2|m\s?²|mts?\s?2|mt2|metros?\s+cuadrados?)`;
const RE_AREA = new RegExp(String.raw`(?:[áa]rea|superficie)([^.;\n]{0,70}?)(\d[\d.,]*)\s*${UNIDAD}(?![\w²])`, 'gi');

export function tipoDeEtiqueta(etiqueta: string): TipoArea {
  const t = etiqueta.toLowerCase();
  if (/construid/.test(t)) return 'CONSTRUIDA';
  if (/demol/.test(t)) return 'DEMOLICION';
  if (/intervenci|intervenir|intervenid/.test(t)) return 'INTERVENCION';
  if (/lote|predio|terreno/.test(t)) return 'LOTE';
  return 'OTRA';
}

/** Superficies declaradas con la palabra «área» o «superficie» junto a una cifra en m². Cada una con su página y su cita. */
export function extraerAreasNativas(paginas: { pagina: number; texto: string }[]): AreaNativa[] {
  const out: AreaNativa[] = [];
  for (const p of paginas) {
    const texto = p.texto.replace(/\s+/g, ' ');
    for (const m of texto.matchAll(RE_AREA)) {
      const valor = parseNumero(m[2]);
      if (valor === null) continue;
      const ini = Math.max(0, (m.index ?? 0) - 20);
      const cita = texto.slice(ini, (m.index ?? 0) + m[0].length + 20).trim();
      const a: AreaNativa = { valor: Math.round(valor * 100) / 100, tipo: tipoDeEtiqueta(m[1]), pagina: p.pagina, cita: cita.slice(0, 240) };
      if (!out.some((x) => x.pagina === a.pagina && x.tipo === a.tipo && x.valor === a.valor)) out.push(a);
    }
  }
  return out;
}

export interface AreaRegistrada {
  id: number; valor: number; tipo: string; estado: string; edificio_id: number | null; pagina: number; cita: string;
  soporte: { version_id: number; documento: string | null; pagina: number } | null;
}

export type AreaDelPrecio =
  | { estado: 'DOCUMENTADA'; valor: number; tipo: string; cita: string; soporte: AreaRegistrada['soporte']; motivo: null }
  | { estado: 'PENDIENTE' | 'CONFLICTO'; valor: null; motivo: string; candidatas: Array<{ valor: number; tipo: string; estado: string; soporte: AreaRegistrada['soporte'] }> };

/**
 * Superficie que sirve para un precio por m²: una sola, documentada de forma explícita, que se refiera al único edificio del proceso.
 * Si hay varias cifras distintas o ninguna, el cálculo queda pendiente; no se elige por frecuencia, máximo ni primera coincidencia.
 */
export function areaParaPrecio(areas: AreaRegistrada[], edificiosDelProceso: number[]): AreaDelPrecio {
  const candidatas = areas.filter((a) => a.estado !== 'DESCARTADA').map((a) => ({ valor: a.valor, tipo: a.tipo, estado: a.estado, soporte: a.soporte }));
  if (edificiosDelProceso.length !== 1) {
    return { estado: 'PENDIENTE', valor: null, candidatas, motivo: edificiosDelProceso.length === 0 ? 'Sin edificio confirmado para atribuir una superficie.' : 'El proceso abarca varios edificios: se exige una superficie documentada para cada uno.' };
  }
  const edificio = edificiosDelProceso[0];
  const validas = areas.filter((a) => a.estado === 'DOCUMENTADA' && a.edificio_id === edificio && (TIPOS_APLICABLES as string[]).includes(a.tipo));
  if (validas.length === 0) {
    const enRevision = areas.some((a) => a.estado === 'EN_REVISION');
    return { estado: 'PENDIENTE', valor: null, candidatas, motivo: enRevision ? 'Hay superficies por verificar: falta confirmar a qué edificio corresponden.' : 'Superficie no documentada para este edificio.' };
  }
  const distintas = [...new Set(validas.map((a) => a.valor.toFixed(2)))];
  if (distintas.length > 1) {
    return { estado: 'CONFLICTO', valor: null, candidatas, motivo: `Los documentos indican superficies distintas (${distintas.map((x) => Number(x).toLocaleString('es-CO')).join(' y ')} m²): falta indicar cuál aplica.` };
  }
  const a = validas[0];
  return { estado: 'DOCUMENTADA', valor: a.valor, tipo: a.tipo, cita: a.cita, soporte: a.soporte, motivo: null };
}
