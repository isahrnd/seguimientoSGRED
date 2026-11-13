import { claveDireccion, fechaDeCorte, leerConsolidado, vincularFilaConsolidado } from './contratacion-consolidado';
import type { HojaTabla } from './contratacion-excel';

// Datos SINTÉTICOS con la misma estructura del consolidado de seguimiento.
const hoja = (filas: Array<Array<string | number | { valor: number; formula: string } | null>>): HojaTabla => {
  const m = new Map<number, Map<number, any>>();
  filas.forEach((f, i) => {
    const cols = new Map<number, any>();
    f.forEach((v, j) => { if (v === null) return; cols.set(j + 1, typeof v === 'object' ? { valor: v.valor, enlace: null, formula: v.formula } : { valor: v, enlace: null, formula: null }); });
    m.set(i + 1, cols);
  });
  return { nombre: 'Hoja1', filas: m };
};
const CAB = ['Nombre Edificación', 'Dirección', 'Estado', 'Avance demolición', 'Valor demolición', 'Metros cuadrados', 'Valor por metro cuadrado', 'Responsable'];

describe('consolidado de seguimiento', () => {
  const tabla = hoja([
    CAB,
    ['Edificio Uno', 'Carrera 10 # 5-20', 'CONTRATADO', 'COMPLETADO', 1000000, 100, 10000, 'EMPRESA A'],
    ['Edificio Dos', 'Calle 3 # 4-5', 'POR CONTRATAR', 'COMPLETADO', { valor: 2500000, formula: '+F3*G3' }, 250, 10000, 'EMPRESA B'],
    [null, null, null, null, null, null, null, null],
    ['Edificio Tres', 'Calle 9 # 1-1', 'POR CONTRATAR', null, null, 50, null, null],
  ]);

  it('lee cada fila con su hoja y celdas de origen, sin evaluar fórmulas (usa el resultado almacenado y conserva la fórmula)', () => {
    const r = leerConsolidado([tabla]);
    expect(r.hojasLeidas).toEqual(['Hoja1']);
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toMatchObject({ nombre: 'Edificio Uno', direccion: 'Carrera 10 # 5-20', estado: 'CONTRATADO', avance: 'COMPLETADO', valor: 1000000, area_m2: 100, valor_m2: 10000, responsable: 'EMPRESA A', hoja: 'Hoja1', fila: 2, formula_valor: null });
    expect(r.filas[0].celdas).toMatchObject({ valor: 'E2', area_m2: 'F2', valor_m2: 'G2', responsable: 'H2', nombre: 'A2' });
    expect(r.filas[1]).toMatchObject({ valor: 2500000, formula_valor: '+F3*G3', fila: 3 });
  });

  it('un dato ausente queda vacío (no se estima): un valor sin cifra no se completa con área × precio', () => {
    const f = leerConsolidado([tabla]).filas[2];
    expect(f).toMatchObject({ nombre: 'Edificio Tres', valor: null, valor_m2: null, avance: null, responsable: null, area_m2: 50 });
  });

  it('una hoja sin ese encabezado no es un consolidado', () => {
    expect(leerConsolidado([hoja([['Proceso', 'Valor'], ['P-1', 100]])]).filas).toEqual([]);
  });

  it('la fecha de corte sale del nombre del archivo', () => {
    expect(fechaDeCorte('DEMOLICIONES_PRESENTACIÓN_11_11_26_.xlsx')).toBe('2026-11-11');
    expect(fechaDeCorte('consolidado 05-03-27.xlsx')).toBe('2027-03-05');
    expect(fechaDeCorte('sin fecha.xlsx')).toBeNull();
    expect(fechaDeCorte('cuadro 45_99_26.xlsx')).toBeNull();
  });

  it('compara direcciones con distinta escritura', () => {
    expect(claveDireccion('Carrera 44 # 9-08, comuna 19')).toBe(claveDireccion('Cra 44#9 - 08'));
    expect(claveDireccion('sin dirección')).toBeNull();
  });
});

describe('vínculo de una fila del consolidado con el edificio registrado', () => {
  const reg = [
    { id: 1, nombre: 'Hotel Ejemplo', direccion: 'Carrera 44 # 9-08, comuna 19', vinculado: false },
    { id: 2, nombre: 'Conjunto Multifamiliar La Fontaine (D\'Corpus)', direccion: 'Calle 9 # 44-11, barrio X', vinculado: false },
    { id: 3, nombre: 'Edificio Cali Express', direccion: 'Calle 9 # 44-59', vinculado: false },
    { id: 4, nombre: 'Edificio Delta', direccion: 'Carrera 7 # 8-9', vinculado: false },
  ];
  it('el mismo nombre vincula, aunque la dirección del consolidado difiera (la discrepancia no se oculta ni se corrige)', () => {
    expect(vincularFilaConsolidado({ nombre: 'Hotel Ejemplo', direccion: 'Carrera 44 # 50-457' }, reg)).toEqual({ edificio_id: 1, por: 'NOMBRE_EXACTO' });
    expect(vincularFilaConsolidado({ nombre: 'CaliExpress', direccion: 'Calle 9 # 44-37' }, reg)).toEqual({ edificio_id: 3, por: 'NOMBRE_EXACTO' });
  });
  it('un nombre solo parecido vincula únicamente si la dirección coincide con la registrada', () => {
    expect(vincularFilaConsolidado({ nombre: 'Edificio D Corpus', direccion: 'Calle 9 # 44-11' }, reg)).toEqual({ edificio_id: 2, por: 'NOMBRE_Y_DIRECCION' });
    expect(vincularFilaConsolidado({ nombre: 'Edificio D Corpus', direccion: 'Calle 9 # 99-99' }, reg)).toBeNull();
  });
  it('un edificio no registrado no se vincula por similitud ni se crea', () => {
    expect(vincularFilaConsolidado({ nombre: 'Conjunto Residencial Ejemplo', direccion: 'Calle 3 # 5B- 7' }, reg)).toBeNull();
    expect(vincularFilaConsolidado({ nombre: 'Manzana 9 Lote 1', direccion: 'Carrera 2 # 2 -3' }, reg)).toBeNull();
  });
});
