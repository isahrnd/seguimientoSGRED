import { extraerPresupuestoNativo, fusionarPresupuestoNativo } from './contratacion-presupuesto-nativo';

// Cifras INVENTADAS. Costo directo 1.000.000.000,00; AIU 15/3/5 %; IVA 19 % sobre la utilidad.
const CABEZA = 'Cotización # 000001 Página 9 3. PRESUPUESTO El valor total de la presente propuesta para el edificio Torre Ejemplo asciende a la suma de: UN MIL SETENTA Y CINCO MILLONES PESOS M/L ($ 1.209.500.000,00) 1. DESMONTAJE ÍTEM DESCRIPCIÓN UND CANT. VR. TOTAL';
const ITEM = 'DESMONTAJE Y DEMOLICIÓN MECÁNICA 1 EDIFICIO TORRE EJEMPLO — CARRERA 1 # 2-3 GL 1,00';
const ROTULOS = 'TOTAL COSTO DIRECTO ADMINISTRACIÓN 15,00% IMPREVISTOS 3,00% UTILIDAD 5,00% TOTAL ANTES DE IVA IVA SOBRE UTILIDAD 19% TOTAL PROPUEST A';
// 1.000.000.000 + 150.000.000 + 30.000.000 + 50.000.000 = 1.230.000.000; IVA 9.500.000; total 1.239.500.000
const VALORES = ['1.000.000.000,00', '1.000.000.000,00', '150.000.000,00', '30.000.000,00', '50.000.000,00', '1.230.000.000,00', '9.500.000,00', '1.239.500.000,00'];

// Disposición A: las cifras junto a sus rótulos. Disposición B: todas juntas al final de la página.
const PAGINA_A = `${CABEZA} ${ITEM} $ ${VALORES[0]} TOTAL COSTO DIRECTO $ ${VALORES[1]} ADMINISTRACIÓN 15,00% ${VALORES[2]} IMPREVISTOS 3,00% ${VALORES[3]} UTILIDAD 5,00% ${VALORES[4]} TOTAL ANTES DE IVA ${VALORES[5]} IVA SOBRE UTILIDAD 19% ${VALORES[6]} TOTAL PROPUEST A ${VALORES[7]} GARANTÍAS`;
const PAGINA_B = `${CABEZA} ${ITEM} ${ROTULOS} GARANTÍAS — PÓLIZAS A CARGO DE LA EMPRESA ($ 1.239.500.000,00) $ ${VALORES[0]} $ ${VALORES[1]} ${VALORES.slice(2).join(' ')}`;

describe('desglose nativo del presupuesto de una cotización', () => {
  it.each([['cifras junto a los rótulos', PAGINA_A], ['cifras agrupadas al final de la página', PAGINA_B]])('%s: asocia por orden, etiqueta cada nivel y los controles cuadran', (_n, texto) => {
    const r = extraerPresupuestoNativo([{ pagina: 8, texto: 'otra página' }, { pagina: 9, texto }]);
    expect(r.ok).toBe(true);
    if (r.ok === false) return;
    const p = r.presupuesto.partidas;
    expect(r.presupuesto.pagina).toBe(9);
    expect(p.map((x) => [x.nivel, x.importe])).toEqual([
      ['PARTIDA', 1_000_000_000], ['SUBTOTAL', 1_000_000_000], ['IMPUESTO_O_AIU', 150_000_000], ['IMPUESTO_O_AIU', 30_000_000],
      ['IMPUESTO_O_AIU', 50_000_000], ['SUBTOTAL', 1_230_000_000], ['IMPUESTO_O_AIU', 9_500_000], ['TOTAL', 1_239_500_000],
    ]);
    expect(p[0]).toMatchObject({ edificio: 'EDIFICIO TORRE EJEMPLO', unidad: 'GLOBAL', cantidad: 1, relacion: 'EXPLICITA', pagina: 9 });
    expect(p[7].alcance).toMatch(/total de la oferta/i);
    expect(p[6].alcance).toMatch(/IVA 19% sobre la utilidad/);
    expect(r.presupuesto.controles_aritmeticos.every((c) => c.estado === 'CUADRA')).toBe(true);
  });

  it('el valor repetido entre paréntesis (en letras y números) no se cuenta como una cifra más', () => {
    const r = extraerPresupuestoNativo([{ pagina: 9, texto: PAGINA_B }]);
    expect(r.ok).toBe(true);
  });

  it('si un control aritmético no cuadra, no se extrae nada (no se corrige ni se adivina)', () => {
    const r = extraerPresupuestoNativo([{ pagina: 9, texto: PAGINA_B.replace('9.500.000,00 1.239.500.000,00', '9.700.000,00 1.239.700.000,00') }]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.motivo).toMatch(/control/);
  });

  it('con otro número de cifras no se asocia por orden', () => {
    const r = extraerPresupuestoNativo([{ pagina: 9, texto: `${PAGINA_B} $ 5.000.000,00` }]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.motivo).toMatch(/se esperaban 8 cifras/);
  });

  it('sin tabla de presupuesto no extrae nada', () => {
    expect(extraerPresupuestoNativo([{ pagina: 1, texto: 'carta de presentación sin tabla' }]).ok).toBe(false);
  });

  it('fusionar sustituye solo las partidas de esa página, conserva el resto y deja constancia del método', () => {
    const previo: any = { campos: { importe: { valor: 1 } }, partidas: [{ pagina: 9, alcance: 'total (modelo)', importe: 1_239_500_000 }, { pagina: 3, alcance: 'otra', importe: 5 }], trazabilidad: { extractor: 'ia-8' } };
    const f = fusionarPresupuestoNativo(previo, [{ pagina: 9, texto: PAGINA_B }]);
    expect(f.aplicado).toBe(true);
    expect(f.resultado.partidas!.filter((x: any) => x.pagina === 3)).toHaveLength(1);
    expect(f.resultado.partidas!.filter((x: any) => x.pagina === 9)).toHaveLength(8);
    expect(f.resultado.partidas!.some((x: any) => x.alcance === 'total (modelo)')).toBe(false);
    expect(f.resultado.trazabilidad.desglose).toMatch(/NATIVO_POR_ORDEN/);
    expect((f.resultado as any).campos.importe.valor).toBe(1);
    const sin = fusionarPresupuestoNativo(previo, [{ pagina: 1, texto: 'nada' }]);
    expect(sin.aplicado).toBe(false);
    expect(sin.resultado).toBe(previo);
  });
});
