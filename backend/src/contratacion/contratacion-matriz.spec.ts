import { CeldaTabla, HojaTabla } from './contratacion-excel';
import { clasificarAlcance, importeDeCelda, leerMatriz, normalizarId, vincularFila } from './contratacion-matriz';
import { enlaceSecop, vistaMatriz } from './contratacion-matriz-vista';

// Estructura de la matriz (identificadores y cifras ficticios).
const c = (valor: string | number | null, enlace: string | null = null): CeldaTabla => ({ valor, enlace });
function hoja(nombre: string, filas: Array<Array<CeldaTabla | null>>, primera = 1): HojaTabla {
  const m = new Map<number, Map<number, CeldaTabla>>();
  filas.forEach((fila, i) => {
    const cols = new Map<number, CeldaTabla>();
    fila.forEach((cel, j) => { if (cel) cols.set(j + 1, cel); });
    m.set(primera + i, cols);
  });
  return { nombre, filas: m };
}
const ENC = ['Cantidad', 'Número de proceso', 'Modalidad', 'Número de contrato', 'Objeto', 'Valor total', 'Estado', 'Contratista', 'Link SECOP II'].map((t) => c(t));
const url = 'https://community.secop.gov.co/contrato/view?id=1';
const compras = hoja('COMPRAS', [
  ENC,
  [c(1), c('9999.001.32.1.515-2026'), c('Contratación directa - Convenio de asociación'), c('9999.001.27.1.5-2026'), c('Aunar esfuerzos para soporte logístico'), c(1000), c('Ejecución'), c('Fundación X'), c('x')],
  [c(2), c('9999.001.32.1.630-2026'), c('Contratación directa - Contrato de obra'), c('9999.001.26.1.630- 2026'), c('Ejecutar actividades de repique, demolición y gestión integral del RCD'), c(123456789.12), c('Ejecución'), c('EMPRESA UNO S.A.S.'), c('Contrato', url)],
  [c(3), c('9999.001.32.1.819 -2026'), c('Contratación directa - Alquiler maquinaria amarilla'), c('9999.001.26.1.819-2026'), c('Alquiler y operación de maquinaria'), c('$ 555.555.555,50'), c('Ejecución'), c('O2 S.A.S.'), c('Contrato', 'http://otro.com/x')],
]);
const adicion = hoja('ADICION', [ENC, [c(1), c('9999.001.32.1.630-2026'), c('Adición'), c('9999.001.26.1.630-2026'), c('Adición al contrato'), c(1500000.5), c('Ejecución'), c('EMPRESA UNO S.A.S.'), c('Contrato', url)]]);

describe('lectura de la matriz de contratación', () => {
  const { filas, hojasLeidas } = leerMatriz([compras, adicion, hoja('OTRA', [[c('nada')]])]);
  it('identifica las columnas por encabezado y lee COMPRAS y ADICION fila por fila', () => {
    expect(hojasLeidas).toEqual(['COMPRAS', 'ADICION']);
    expect(filas.filter((f) => f.tipo_hoja === 'COMPRAS')).toHaveLength(3);
    expect(filas.filter((f) => f.tipo_hoja === 'ADICION')).toHaveLength(1);
  });
  it('conserva identificadores originales, celdas con su referencia y el valor con centavos', () => {
    const f = filas.find((x) => x.hoja === 'COMPRAS' && x.fila === 3)!;
    expect(f.proceso_original).toBe('9999.001.32.1.630-2026');
    expect(f.contrato_original).toBe('9999.001.26.1.630- 2026');
    expect(f.valor).toBe(123456789.12);
    expect(f.celdas).toMatchObject({ proceso_original: 'B3', contrato_original: 'D3', valor: 'F3', link: 'I3' });
    expect(f.secop_url).toBe(url);
  });
  it('lee un importe escrito como texto con formato colombiano', () => {
    expect(filas.find((x) => x.fila === 4 && x.tipo_hoja === 'COMPRAS')!.valor).toBe(555555555.5);
    expect(importeDeCelda('$ 1.234,56')).toBe(1234.56);
    expect(importeDeCelda('1.234.567')).toBe(1234567);
    expect(importeDeCelda(null)).toBeNull();
  });
  it('proceso y contrato son identificadores distintos y se normalizan por separado', () => {
    const f = filas.find((x) => x.hoja === 'COMPRAS' && x.fila === 3)!;
    expect(f.proceso_norm).not.toBe(f.contrato_norm);
    expect(f.contrato_norm).toBe('9999.001.26.1.630-2026'.toUpperCase());
    expect(normalizarId('9999.001.32.1.819 –  2026')).toBe('9999.001.32.1.819-2026');
  });
});

describe('alcance de cada fila', () => {
  it('separa convenios, operación logística, grúas, demolición, maquinaria y RCD', () => {
    expect(clasificarAlcance('Contratación directa - Convenio de asociación', 'Aunar esfuerzos')).toBe('CONVENIO');
    expect(clasificarAlcance('Contratación directa - Contrato', 'Operador logístico para la emergencia')).toBe('OPERACION_LOGISTICA');
    expect(clasificarAlcance('Contrato alquiler maquinaria amarilla', 'Alquiler de grúas para izaje')).toBe('GRUAS');
    expect(clasificarAlcance('Contrato de obra', 'Repique, demolición y gestión integral del RCD')).toBe('DEMOLICION');
    expect(clasificarAlcance('Alquiler maquinaria amarilla', 'Alquiler y operación de equipos')).toBe('MAQUINARIA');
    expect(clasificarAlcance('Contrato', 'Cargue y transporte de RCD')).toBe('RCD');
    expect(clasificarAlcance(null, null)).toBe('OTRO');
  });
});

describe('vínculo con el expediente', () => {
  const exps = [
    { id: 1, proceso: '9999.001.32.1.630-2026', numero_contrato: null },
    { id: 2, proceso: 'CONTRATO-9999.001.26.1.819-2026', numero_contrato: '9999.001.26.1.819-2026' },
    { id: 3, proceso: '9999.001.32.1.629-2026', numero_contrato: '9999.001.26.1.629-2026' },
  ];
  const { filas } = leerMatriz([compras, adicion]);
  it('vincula por proceso aunque el contrato venga con espacios', () => {
    expect(vincularFila(filas.find((x) => x.tipo_hoja === 'COMPRAS' && x.fila === 3)!, exps)).toEqual({ expedienteId: 1, por: 'PROCESO' });
  });
  it('vincula por contrato cuando el expediente aún no tiene proceso verificado', () => {
    expect(vincularFila(filas.find((x) => x.tipo_hoja === 'COMPRAS' && x.fila === 4)!, exps)).toEqual({ expedienteId: 2, por: 'CONTRATO' });
  });
  it('una adición se vincula con el expediente de su contrato', () => {
    expect(vincularFila(filas.find((x) => x.tipo_hoja === 'ADICION')!, exps)?.expedienteId).toBe(1);
  });
  it('no vincula convenios sin expediente ni ante coincidencias múltiples', () => {
    expect(vincularFila(filas.find((x) => x.fila === 2 && x.tipo_hoja === 'COMPRAS')!, exps)).toBeNull();
    expect(vincularFila({ proceso_norm: normalizarId('9999.001.32.1.630-2026'), contrato_norm: null }, [exps[0], { ...exps[0], id: 9 }])).toBeNull();
  });
});

describe('vista para fichas, listado y exportación', () => {
  const fila = (f: any) => ({ id: 1, hoja: 'COMPRAS', fila: 6, tipo_hoja: 'COMPRAS', proceso_original: 'P', contrato_original: 'C', modalidad: null, objeto: null, estado: null, contratista: null, secop_url: null, alcance: 'DEMOLICION', vinculo: 'PROCESO',
    celdas: { valor: 'F6', link: 'I6' }, version: { id: 7, documento_id: 3, numero: 1, vigente: true, documento: { nombre: 'matriz.xlsx' } }, ...f });
  it('muestra el valor reportado con su celda y no lo suma a contratos', () => {
    const v = vistaMatriz([fila({ valor: 123456789.12 })], []);
    expect(v.valor_reportado).toMatchObject({ importe: 123456789.12, concepto: 'Valor contractual reportado en matriz', celda: 'F6', coincide_con_contrato: false });
    expect(v.valor_reportado?.soporte).toMatchObject({ version_id: 7, hoja: 'COMPRAS', celda: 'F6' });
  });
  it('un contrato en PDF con el mismo importe es una sola cifra con dos fuentes', () => {
    expect(vistaMatriz([fila({ valor: 100 })], [{ valor: 100 }]).valor_reportado?.coincide_con_contrato).toBe(true);
  });
  it('las adiciones quedan aparte y sin valor reportado propio', () => {
    const v = vistaMatriz([fila({ valor: 100 }), fila({ id: 2, tipo_hoja: 'ADICION', hoja: 'ADICION', fila: 2, valor: 5 })], []);
    expect(v.adiciones).toHaveLength(1);
    expect(v.valor_reportado?.importe).toBe(100);
  });
  it('solo expone enlaces https de SECOP II', () => {
    expect(enlaceSecop(url)).toBe(url);
    expect(enlaceSecop('http://community.secop.gov.co/x')).toBeNull();
    expect(enlaceSecop('https://evil.example/secop.gov.co')).toBeNull();
    expect(enlaceSecop('javascript:alert(1)')).toBeNull();
  });
});
