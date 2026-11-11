import { CeldaTabla, HojaTabla } from './contratacion-excel';
import { leerCotizacionExcel } from './contratacion-cotizacion-excel';

// Hoja ficticia con la plantilla «RESUMEN»: columnas C..H = ITEM, Descripción, UNIDAD, CANTIDAD, VR. UNITARIO, VR. PARCIAL.
const c = (valor: string | number | null): CeldaTabla => ({ valor, enlace: null });
function hoja(nombre: string, filas: Record<number, Record<string, string | number | null>>): HojaTabla {
  const m = new Map<number, Map<number, CeldaTabla>>();
  for (const [f, cols] of Object.entries(filas)) {
    const r = new Map<number, CeldaTabla>();
    for (const [col, v] of Object.entries(cols)) r.set(col.charCodeAt(0) - 64, c(v));
    m.set(Number(f), r);
  }
  return { nombre, filas: m };
}

const RESUMEN = hoja('RESUMEN', {
  9: { C: 'NOMBRE DEL PROYECTO', D: 'Edificio Ejemplo Alfa: Localizado en la Calle 1 # 2-3', G: 'FECHA:', H: '2030-01-05' },
  28: { C: 'ITEM', D: 'Descripción', E: 'UNIDAD ', F: 'CANTIDAD', G: 'VR. UNITARIO', H: 'VR. PARCIAL' },
  29: { C: '1', D: 'ESTUDIO DE VULNERABILIDAD', H: 100 },
  30: { C: '1.1', D: 'Inspección y levantamiento' },
  31: { C: '4', D: 'DEMOLICIONES', E: 'GL', H: 300 },
  32: { C: '4.1', D: 'Demolición mecánica de placas', H: null },
  33: { C: '5', D: 'DISPOSICION FINAL', E: 'GL', H: 100 },
  36: { G: 'SUBTOTAL', H: 500 },
  38: { C: 'COSTOS DIRECTOS', H: 500 },
  39: { C: 'A', G: 0.12, H: 60 },
  40: { C: 'I', G: 0.06, H: 30 },
  41: { C: 'U', G: 0.05, H: 25 },
  42: { C: 'IVA 19% ', G: 0.19, H: 5 },
  43: { C: 'TOTAL PROYECTO', H: 620 },
  47: { C: 'CONDICIONES COMERCIALES', D: 'Contacto', G: 'EMPRESA EJEMPLO/PERSONA INVENTADA' },
  48: { C: 'CONDICIONES COMERCIALES', F: 'NIT', G: '900111222-3' },
  49: { C: 'CONDICIONES COMERCIALES', D: 'No. Cotización', G: 'C-001' },
  50: { C: 'CONDICIONES COMERCIALES', D: 'Fecha de la cotización', G: '2030-01-02' },
});
const PLANTILLA_OTRO = hoja('RESUMEN (2)', { 9: { C: 'NOMBRE DEL PROYECTO', D: 'OBRAS CIVILES PARA CALDERA SUCROAL', H: '2025-01-31' }, 27: { C: 'ITEM', D: 'Descripción', H: 'VR. PARCIAL' }, 29: { C: '1', D: 'Acero de refuerzo', H: null } });
const HOJA_MISMO_PROYECTO = hoja('RESUMEN (2)', { 9: { C: 'NOMBRE DEL PROYECTO', D: 'Edificio Ejemplo Alfa: Localizado en la Calle 1 # 2-3' }, 28: { C: 'ITEM', D: 'Descripción', H: 'VR. PARCIAL' }, 29: { C: '1', D: 'Otra actividad', H: 10 }, 31: { G: 'SUBTOTAL', H: 10 } });

describe('lectura nativa de una cotización en Excel', () => {
  const r = leerCotizacionExcel([PLANTILLA_OTRO, RESUMEN]);
  it('lee la hoja RESUMEN y descarta la plantilla de otro proyecto', () => {
    expect(r.aplica).toBe(true);
    expect(r.hoja).toBe('RESUMEN');
    expect(r.hojas_descartadas).toHaveLength(1);
    expect(r.hojas_descartadas[0].hoja).toBe('RESUMEN (2)');
    expect(r.hojas_descartadas[0].motivo).toMatch(/otro proyecto: nombre «OBRAS CIVILES PARA CALDERA SUCROAL» \(RESUMEN \(2\), celda D9, fecha 2025-01-31\)/);
  });
  it('una hoja «RESUMEN (2)» SIN evidencia de otro proyecto no se descarta por su nombre: se lee y se marca para revisión', () => {
    const x = leerCotizacionExcel([HOJA_MISMO_PROYECTO, RESUMEN].reverse());
    expect(x.hojas_descartadas[0].motivo).toMatch(/SIN evidencia de otro proyecto/);
    expect(x.partidas.some((p) => p.alcance === '[hoja RESUMEN (2)] Otra actividad' && p.importe === 10)).toBe(true);
    expect(x.controles_aritmeticos.some((c) => c.control.includes('(hoja RESUMEN (2))'))).toBe(true);
  });
  it('una hoja sin la plantilla de cotización (p. ej. registro fotográfico) se ignora sin descartarla como otro proyecto', () => {
    const x = leerCotizacionExcel([RESUMEN, hoja('REGISTRO FOTOGRAFICO', {})]);
    expect(x.hojas_descartadas).toEqual([]);
  });
  it('extrae edificio, proveedor (solo la empresa, sin nombres de personas), NIT, número y fecha con su celda', () => {
    expect(r.campos.edificio).toMatchObject({ valor: 'Edificio Ejemplo Alfa', fuente: 'Hoja RESUMEN, celda D9' });
    expect(r.campos.proveedor).toMatchObject({ valor: 'EMPRESA EJEMPLO', fuente: 'Hoja RESUMEN, celda G47' });
    expect(JSON.stringify(r)).not.toContain('PERSONA INVENTADA');
    expect(r.campos.nit_proveedor.valor).toBe('900111222-3');
    expect(r.campos.numero_cotizacion.valor).toBe('C-001');
    expect(r.campos.importe).toMatchObject({ valor: 620, fuente: 'Hoja RESUMEN, celda H43' });
  });
  it('separa partidas, componentes sin valor, subtotal, AIU, IVA y total; cada fila con su celda', () => {
    const niveles = r.partidas.map((p) => [p.item ?? p.alcance, p.nivel]);
    expect(niveles).toEqual([
      ['1', 'PARTIDA'], ['1.1', 'COMPONENTE_SIN_VALOR'], ['4', 'PARTIDA'], ['4.1', 'COMPONENTE_SIN_VALOR'], ['5', 'PARTIDA'],
      ['Subtotal', 'SUBTOTAL'], ['Costos directos', 'SUBTOTAL'], ['A', 'IMPUESTO_O_AIU'], ['I', 'IMPUESTO_O_AIU'], ['U', 'IMPUESTO_O_AIU'], ['IVA 19%', 'IMPUESTO_O_AIU'], ['Total proyecto', 'TOTAL'],
    ]);
    expect(r.partidas.find((p) => p.item === '4')).toMatchObject({ unidad: 'GL', importe: 300, fuente: 'Hoja RESUMEN, celda H31' });
    expect(r.partidas.find((p) => p.item === 'A')).toMatchObject({ porcentaje: 0.12, importe: 60 });
  });
  it('controles aritméticos sin sumar subtotales ni totales a las partidas', () => {
    expect(r.controles_aritmeticos.map((x) => [x.control, x.estado])).toEqual([
      ['Suma de partidas = subtotal', 'CUADRA'], ['Subtotal = costos directos', 'CUADRA'], ['Costos directos + AIU + IVA = total proyecto', 'CUADRA'],
    ]);
    expect(r.controles_aritmeticos[0]).toMatchObject({ calculado: 500, declarado: 500 });
  });
  it('un capítulo con subítems valorados es un subtotal de ellos, no una partida', () => {
    const h = hoja('RESUMEN', { 28: { C: 'ITEM', D: 'Descripción', H: 'VR. PARCIAL' }, 29: { C: '1', D: 'CAPITULO', H: 30 }, 30: { C: '1.1', D: 'a', H: 10 }, 31: { C: '1.2', D: 'b', H: 20 }, 33: { G: 'SUBTOTAL', H: 30 } });
    const x = leerCotizacionExcel([h]);
    expect(x.partidas.slice(0, 3).map((p) => p.nivel)).toEqual(['SUBTOTAL', 'PARTIDA', 'PARTIDA']);
    expect(x.controles_aritmeticos[0]).toMatchObject({ calculado: 30, declarado: 30, estado: 'CUADRA' });
  });
  it('un total que no cuadra se informa sin corregirlo', () => {
    const h = hoja('RESUMEN', { 28: { C: 'ITEM', D: 'Descripción', H: 'VR. PARCIAL' }, 29: { C: '1', D: 'a', H: 100 }, 31: { G: 'SUBTOTAL', H: 90 } });
    expect(leerCotizacionExcel([h]).controles_aritmeticos[0]).toMatchObject({ estado: 'NO_CUADRA', diferencia: -10 });
  });
  it('sin la plantilla no inventa nada', () => {
    expect(leerCotizacionExcel([hoja('Otra', { 1: { A: 'x' } })])).toMatchObject({ aplica: false });
    expect(leerCotizacionExcel([hoja('RESUMEN', { 1: { A: 'x' } })]).aplica).toBe(false);
  });
});
