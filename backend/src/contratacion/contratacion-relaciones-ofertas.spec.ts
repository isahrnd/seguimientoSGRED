import { evaluarEtiqueta, evidenciaRelacion, proponerRelaciones } from './contratacion-relaciones-ofertas';

// Nombres de edificios FICTICIOS con las mismas variantes de escritura que se presentan en las ofertas.
const REG = [
  { id: 1, nombre: 'Edificio Archinal' }, { id: 2, nombre: 'Centro Comercial y Residencial Laverton' }, { id: 3, nombre: 'Edificio Cali Rápido' },
  { id: 4, nombre: 'Edificio María Mercedes Lloraza' }, { id: 5, nombre: 'Motel Molino Verde' }, { id: 6, nombre: 'Hotel Meridiano' }, { id: 7, nombre: 'Edificio Granito Norte' }, { id: 8, nombre: 'Edificio Granito Sur' },
];

describe('relación de filas de una oferta con edificios registrados', () => {
  it.each([
    ['EDIFICIO ARCHINAL', 1, 'NOMBRE_EXACTO'],
    ['Ed. Archinnal', 1, 'VARIANTE_TIPOGRAFICA'],
    ['Edificio Arrchinal', 1, 'VARIANTE_TIPOGRAFICA'],
    ['Edificio Lavverton', 2, 'VARIANTE_TIPOGRAFICA'],
    ['Edificio Cali Rapido', 3, 'NOMBRE_EXACTO'],
    ['EDIFICIO MARIA MERCEDES', 4, 'NOMBRE_CONTENIDO'],
    ['DIFICIO MOLINO VERDE', 5, 'NOMBRE_CONTENIDO'],
    ['HOTEL MERIDIANO', 6, 'NOMBRE_EXACTO'],
  ])('«%s» se relaciona con el edificio %i (%s)', (etiqueta, id, metodo) => {
    const r = evaluarEtiqueta(etiqueta, REG);
    expect(r.candidato?.id).toBe(id);
    expect(r.metodo).toBe(metodo);
  });

  it('un nombre sin edificio registrado, o parecido a dos, no se relaciona', () => {
    expect(evaluarEtiqueta('CONJUNTO RESIDENCIAL LAURELITOS', REG).candidato).toBeNull();
    expect(evaluarEtiqueta('EDIFICIO PERALTA', REG).candidato).toBeNull();
    const ambiguo = evaluarEtiqueta('Edificio Granito', REG);
    expect(ambiguo.candidato).toBeNull();
    expect(ambiguo.ambigua).toBe(true);
  });

  it('las filas sin edificio (totales de la oferta conjunta) no se atribuyen a ningún edificio', () => {
    const r = proponerRelaciones([
      { edificio: 'EDIFICIO ARCHINAL', pagina: 8, importe: 100, alcance: 'x' },
      { edificio: null, pagina: 8, importe: 999999, alcance: 'Total de la oferta' },
      { edificio: 'CONJUNTO RESIDENCIAL LAURELITOS', pagina: 8, importe: 50, alcance: 'y' },
    ], REG, []);
    expect(r.map((x) => [x.etiqueta, x.estado])).toEqual([['EDIFICIO ARCHINAL', 'APLICABLE'], ['CONJUNTO RESIDENCIAL LAURELITOS', 'SIN_EDIFICIO_REGISTRADO']]);
    expect(r[1].falta).toMatch(/dirección, matrícula o resolución/);
  });

  it('lo ya vinculado se reconoce y no se vuelve a proponer', () => {
    const r = proponerRelaciones([{ edificio: 'EDIFICIO ARCHINAL', pagina: 2, importe: 1, alcance: 'x' }], REG, [1]);
    expect(r[0].estado).toBe('YA_VINCULADO');
  });

  it('la evidencia dice que es una comprobación del asistente, cita página y fila, y cabe en 400 caracteres', () => {
    const [p] = proponerRelaciones([{ edificio: 'Ed. Archinnal', pagina: 2, importe: 2530000000, alcance: 'x' }], REG, []);
    const t = evidenciaRelacion('1. DOCUMENTO LARGO DE PRUEBA.pdf', p);
    expect(t).toMatch(/^Comprobación documental del asistente \(no es una confirmación humana\)/);
    expect(t).toContain('p. 2');
    expect(t).toContain('«Ed. Archinnal»');
    expect(t).toContain('«Edificio Archinal»');
    expect(t).toMatch(/total de una oferta conjunta/);
    expect(t.length).toBeLessThanOrEqual(400);
  });
});
