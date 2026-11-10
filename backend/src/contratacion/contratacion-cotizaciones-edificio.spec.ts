import { validarEntrada, CotizacionEdificioEntrada } from './contratacion-cotizaciones-edificio.service';

const base: CotizacionEdificioEntrada = {
  edificio: 'Edificio Ficticio', documento: 'a'.repeat(32), proveedor: 'Proveedor S.A.', concepto: 'Partida 5', importe: 1000, base: 'COSTO_DIRECTO',
  pagina: 8, verificacion: 'VERIFICADO_EN_IMAGEN',
};

describe('cotizaciones por edificio: reglas de validación', () => {
  it('acepta una entrada con fuente PDF verificada', () => expect(validarEntrada(base, 0)).toEqual([]));
  it('acepta una referencia de Excel con hoja y celda', () =>
    expect(validarEntrada({ ...base, pagina: null, hoja: 'Hoja1', celda: 'I2', verificacion: 'COINCIDE_CON_PDF' }, 0)).toEqual([]));
  it('exige una sola fuente', () => {
    expect(validarEntrada({ ...base, hoja: 'H', celda: 'A1' }, 0).join()).toMatch(/una sola fuente/);
    expect(validarEntrada({ ...base, pagina: null }, 0).join()).toMatch(/una sola fuente/);
  });
  it('«verificado en imagen» exige página de PDF', () =>
    expect(validarEntrada({ ...base, pagina: null, hoja: 'H', celda: 'A1' }, 0).join()).toMatch(/exige página/));
  it('rechaza importes, bases y huellas no válidos', () => {
    const e = validarEntrada({ ...base, importe: 0, base: 'OTRA' as any, documento: 'xyz' }, 0).join();
    expect(e).toMatch(/importe/);
    expect(e).toMatch(/base/);
    expect(e).toMatch(/MD5/);
  });
  it('rechaza una celda mal formada', () => expect(validarEntrada({ ...base, pagina: null, hoja: 'H', celda: '2I', verificacion: 'PENDIENTE' }, 0).join()).toMatch(/celda/));
});
