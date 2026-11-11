import { analizarPartidas, nivelPartida } from './contratacion-partidas';

// Oferta ficticia con 3 alternativas, totales por alternativa, subtotal y total general (con AIU e IVA).
const filas = [
  { edificio: 'Edificio Alfa', alcance: 'Alternativa 1 - Implosión', importe: 100, pagina: 5 },
  { edificio: 'Edificio Beta', alcance: 'Alternativa 1 - Implosión', importe: 50, pagina: 5 },
  { edificio: null, alcance: 'Alternativa 1 - Total', importe: 150, pagina: 5 },
  { edificio: 'Edificio Gamma', alcance: 'Alternativa 2 - Desmonte', importe: 200, pagina: 5 },
  { edificio: 'Edificio Delta', alcance: 'Alternativa 2 - Desmonte', importe: 70, pagina: 5 },
  { edificio: null, alcance: 'Alternativa 2 - Total', importe: 280, pagina: 5 }, // no cuadra a propósito (270)
  { edificio: 'Edificio Épsilon', alcance: 'Alternativa 3 - Demolición', importe: 30, pagina: 6 },
  { edificio: null, alcance: 'Subtotal propuesta tres alternativas', importe: 450, pagina: 6 },
  { edificio: null, alcance: 'IVA reportado', importe: 5, pagina: 6 },
  { edificio: null, alcance: 'Total propuesta tres alternativas (siete edificaciones)', importe: 520, pagina: 6 },
];

describe('partidas, subtotales y totales', () => {
  it('clasifica cada fila', () => {
    expect(filas.map((f) => nivelPartida(f.alcance, null))).toEqual(['PARTIDA', 'PARTIDA', 'TOTAL', 'PARTIDA', 'PARTIDA', 'TOTAL', 'PARTIDA', 'SUBTOTAL', 'IMPUESTO_O_AIU', 'TOTAL']);
  });
  it('la suma solo incluye partidas: nunca subtotales, totales ni impuestos', () => {
    const a = analizarPartidas(filas);
    expect(a.suma_solo_partidas).toBe(450);
    expect(a.suma_solo_partidas).not.toBe(450 + 150 + 280 + 450 + 5 + 520);
  });
  it('controla cada alternativa contra su total declarado y señala lo que no cuadra', () => {
    const c = analizarPartidas(filas).controles;
    expect(c.find((x) => x.grupo === 'Alternativa 1')).toMatchObject({ suma_partidas: 150, total_declarado: 150, estado: 'CUADRA' });
    expect(c.find((x) => x.grupo === 'Alternativa 2')).toMatchObject({ suma_partidas: 270, total_declarado: 280, estado: 'NO_CUADRA', diferencia: 10 });
    expect(c.find((x) => x.grupo === 'Alternativa 3')).toMatchObject({ suma_partidas: 30, total_declarado: null, estado: 'SIN_TOTAL_DECLARADO' });
  });
  it('el total con impuestos no se compara contra las partidas (incluye AIU e IVA)', () => {
    const g = analizarPartidas(filas).controles.find((x) => x.grupo === 'General')!;
    expect(g.estado).toBe('SIN_TOTAL_DECLARADO');
  });
  it('respeta el nivel ya guardado', () => {
    expect(analizarPartidas([{ edificio: null, alcance: 'x', importe: 9, pagina: 1, nivel: 'TOTAL' }]).suma_solo_partidas).toBe(0);
  });
});
