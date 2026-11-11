/**
 * Partidas, subtotales y totales de una oferta. Un total (o un subtotal) NO es una partida: el total ya contiene a las partidas que resume, de modo
 * que sumar ambos duplica el valor. Aquí se clasifica cada fila y se controla (sin sumar totales a partidas) si lo declarado cuadra con la suma de
 * sus partidas. Un control que no cuadra no corrige nada: se informa.
 */
export type NivelPartida = 'PARTIDA' | 'SUBTOTAL' | 'TOTAL' | 'IMPUESTO_O_AIU';

export function nivelPartida(alcance: string | null | undefined, cita: string | null | undefined): NivelPartida {
  const t = `${alcance ?? ''} ${cita ?? ''}`.toLowerCase();
  if (/sub\s?-?\s?total/.test(t)) return 'SUBTOTAL';
  if (/\b(administraci[oó]n|imprevistos?|utilidad|iva|a\.i\.u|aiu)\b/.test(t) && !/total/.test((alcance ?? '').toLowerCase())) return 'IMPUESTO_O_AIU';
  if (/\btotal\b|valor\s+(?:de\s+la\s+)?propuesta|presupuesto\s+oficial/.test(t)) return 'TOTAL';
  return 'PARTIDA';
}

export interface PartidaEntrada { edificio: string | null; alcance: string; importe: number; pagina: number; nivel?: NivelPartida }
export interface ControlSuma {
  grupo: string;
  suma_partidas: number;
  total_declarado: number | null;
  estado: 'CUADRA' | 'NO_CUADRA' | 'SIN_TOTAL_DECLARADO';
  diferencia: number | null;
}

/** Grupo de una fila: «Alternativa 2», o «General» si no se indica. */
const grupoDe = (alcance: string) => {
  const m = /alternativa\s*(\d+)/i.exec(alcance);
  return m ? `Alternativa ${m[1]}` : 'General';
};

export function analizarPartidas(partidas: PartidaEntrada[]) {
  const con = partidas.map((p) => ({ ...p, nivel: p.nivel ?? nivelPartida(p.alcance, null) }));
  const grupos = [...new Set(con.map((p) => grupoDe(p.alcance)))];
  const controles: ControlSuma[] = grupos.map((g) => {
    const filas = con.filter((p) => grupoDe(p.alcance) === g);
    const suma = Math.round(filas.filter((p) => p.nivel === 'PARTIDA').reduce((a, p) => a + p.importe, 0) * 100) / 100;
    const declarado = filas.find((p) => p.nivel === 'TOTAL' && g !== 'General') ?? null;
    if (!declarado) return { grupo: g, suma_partidas: suma, total_declarado: null, estado: 'SIN_TOTAL_DECLARADO', diferencia: null };
    const dif = Math.round((declarado.importe - suma) * 100) / 100;
    return { grupo: g, suma_partidas: suma, total_declarado: declarado.importe, estado: Math.abs(dif) < 1 ? 'CUADRA' : 'NO_CUADRA', diferencia: dif };
  });
  return {
    partidas: con,
    controles,
    /** Nunca se suma a las partidas un subtotal, un total ni un impuesto. */
    suma_solo_partidas: Math.round(con.filter((p) => p.nivel === 'PARTIDA').reduce((a, p) => a + p.importe, 0) * 100) / 100,
    nota: 'Los subtotales, totales e impuestos resumen a las partidas: no se suman a ellas.',
  };
}
