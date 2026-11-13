import { alcanceResumido, construirEjecutiva, ofertaParaDesglose, valorDeOferta } from './contratacion-ficha-ejecutiva';
import { construirFila, EntradaFila, OfertaEdificio } from './contratacion-vista-precios';

// Datos SINTÉTICOS.
const fuente = (n = 1, pagina: number | null = 3) => ({ version_id: n, documento: `doc${n}.pdf`, pagina, hoja: null, celda: null });
const oferta = (empresa: string, extra: Partial<OfertaEdificio> = {}): OfertaEdificio => ({
  empresa, documento: `${empresa}.pdf`, version_id: 1, etapa: 'COTIZACION', fecha: '2026-09-18', referencia: null, secuencia: null, nota_version: null, nivel: 'COSTO_DIRECTO',
  items: [{ actividad: 'Demolición total', unidad: 'GLOBAL', cantidad: 1, precio_unitario: null, subtotal: 100, nivel: 'PARTIDA', fuente: fuente() }],
  componentes: { costo_directo: 100, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null }, fuentes_componentes: { costo_directo: fuente() },
  alcance: null, oferta_conjunta: null, relacion: 'x', controles: [], ...extra,
});
const consolidado = (valor: number | null = 1_000_000.4) => ({
  id: 1, nombre: 'Edificio Alfa', direccion: 'Calle 1', estado: 'CONTRATADO', avance: 'COMPLETADO', valor, area_m2: 100, valor_m2: 10_000, responsable: 'EMPRESA UNO S.A.S.', formula_valor: null, fecha_corte: '2026-11-11', vinculo: null,
  fuentes: { valor: fuente(9), area_m2: fuente(9), valor_m2: fuente(9), responsable: fuente(9), estado: fuente(9) },
});
const entrada = (extra: Partial<EntradaFila> = {}): EntradaFila => ({ edificio: { id: 5, nombre: 'Edificio Alfa', direccion: 'Calle 1' }, consolidado: consolidado(), procesos: [], area_documentada: null, ofertas: [], contrato_por_vincular: false, analisis_sector: false, ...extra });

describe('capa ejecutiva de la ficha', () => {
  it('el valor de una oferta usa el total si consta, si no el costo directo, y declara su base', () => {
    expect(valorDeOferta(oferta('A', { componentes: { costo_directo: 100, administracion: null, imprevistos: null, utilidad: null, iva: null, total: 150 }, fuentes_componentes: { total: fuente(2) } }))).toMatchObject({ valor: 150, base: 'Total con AIU e IVA' });
    expect(valorDeOferta(oferta('A'))).toMatchObject({ valor: 100, base: 'Costo directo' });
    expect(valorDeOferta(oferta('A', { componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null }, nivel: 'NO_ESPECIFICADO' }))).toMatchObject({ valor: 100, base: 'Base no especificada' });
    expect(valorDeOferta(oferta('A', { items: [], componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null } }))).toBeNull();
  });

  it('el desglose muestra por defecto la oferta de la empresa responsable; sin coincidencia, la más completa; sin ofertas, ninguna', () => {
    const lista = [oferta('OTRA EMPRESA'), oferta('EMPRESA UNO S.A.S.', { items: [] }), oferta('TERCERA', { items: [oferta('x').items[0], oferta('x').items[0]] })];
    expect(ofertaParaDesglose(lista, 'EMPRESA UNO')).toBe(1);
    expect(ofertaParaDesglose(lista, 'Responsable ajeno')).toBe(2);
    expect(ofertaParaDesglose([], 'EMPRESA UNO')).toBeNull();
  });

  it('la comparación presenta todas las ofertas con valor como referencias separadas, con su base, sin porcentajes ni orden de selección', () => {
    const f = construirFila(entrada({ ofertas: [oferta('A', { fecha: '2026-09-18' }), oferta('A', { fecha: '2026-10-20', version_id: 2, componentes: { costo_directo: 120, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null } }), oferta('B', { componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: 300 }, fuentes_componentes: { total: fuente(3) } })] }));
    const c = f.ejecutivo.comparacion;
    expect(c.map((x) => [x.empresa, x.secuencia, x.valor, x.base])).toEqual([['A', 'ANTERIOR', 100, 'Costo directo'], ['B', null, 300, 'Total con AIU e IVA'], ['A', 'POSTERIOR', 120, 'Costo directo']]);
    expect(f.ejecutivo.nota_comparacion).toMatch(/no se calcula una diferencia porcentual/);
    expect(f.ejecutivo.nota_comparacion).toMatch(/no implican que la oferta haya sido aceptada/);
    expect(JSON.stringify(f.ejecutivo)).not.toMatch(/\d\s?%/);
  });

  it('una oferta conjunta se resume con su alcance y sin atribuir el total al edificio', () => {
    const o = oferta('A', { oferta_conjunta: { edificios: 9, total: 9_000_000 } });
    expect(alcanceResumido(o)).toBe('Demolición total · Oferta conjunta de 9 edificios; cifra de este edificio');
    expect(JSON.stringify(construirFila(entrada({ ofertas: [o] })).ejecutivo)).not.toContain('9000000');
  });

  it('una diferencia de centavos va al detalle de cálculo; una diferencia mayor se comunica de forma breve y visible', () => {
    const menor = construirFila(entrada({ procesos: [{ id: 3, proceso: 'P-1', numero_contrato: null, intervencion: null, edificios_del_proceso: 1, contratos: [], reportado_matriz: { importe: 1_000_000.66, soporte: fuente(4) }, presupuesto_oficial: null }] }));
    expect(menor.ejecutivo.diferencias_visibles).toEqual([]);
    expect(menor.ejecutivo.diferencias_calculo).toHaveLength(1);
    expect(menor.diferencias).toHaveLength(1); // la lista completa se conserva para el detalle y el Excel
    const mayor = construirFila(entrada({ procesos: [{ id: 3, proceso: 'P-1', numero_contrato: null, intervencion: null, edificios_del_proceso: 1, contratos: [], reportado_matriz: { importe: 2_000_000, soporte: fuente(4) }, presupuesto_oficial: null }] }));
    expect(mayor.ejecutivo.diferencias_visibles).toHaveLength(1);
    expect(mayor.ejecutivo.diferencias_visibles[0]).toMatch(/^Valor distinto según la fuente/);
    expect(mayor.ejecutivo.diferencias_calculo).toEqual([]);
  });

  it('«Ver contrato» solo existe con un contrato incorporado; el consolidado nunca lo sustituye', () => {
    const sin = construirFila(entrada({ procesos: [{ id: 3, proceso: 'P-1', numero_contrato: null, intervencion: null, edificios_del_proceso: 1, contratos: [], reportado_matriz: null, presupuesto_oficial: null }] }));
    expect(sin.ejecutivo.contrato).toBeNull();
    expect(sin.ejecutivo.nota).toBe('Valor reportado en el consolidado; el contrato aún no está incorporado.');
    const con = construirFila(entrada({ procesos: [{ id: 3, proceso: 'P-1', numero_contrato: 'C-9', intervencion: null, edificios_del_proceso: 1, contratos: [{ valor: 900, tipo_acto: 'CONTRATO', numero: 'C-9', contratista: 'EMPRESA UNO', soporte: fuente(7, 1) }], reportado_matriz: null, presupuesto_oficial: null }] }));
    expect(con.ejecutivo.contrato).toMatchObject({ conjunto: false, proceso: 'P-1', proceso_id: 3, fuente: { version_id: 7 } });
    expect(con.ejecutivo.nota).toBeNull();
    const conjunto = construirFila(entrada({ procesos: [{ id: 4, proceso: 'P-2', numero_contrato: null, intervencion: null, edificios_del_proceso: 3, contratos: [{ valor: 900, tipo_acto: 'CONTRATO', numero: null, contratista: 'X', soporte: fuente(8, 1) }], reportado_matriz: null, presupuesto_oficial: null }] }));
    expect(conjunto.ejecutivo.contrato?.conjunto).toBe(true);
    expect(conjunto.ejecutivo.nota).toMatch(/su valor no se reparte/);
  });

  it('sin ofertas la nota de comparación lo dice en una frase y construirEjecutiva no inventa desglose', () => {
    const x = construirEjecutiva({ fila: { valor: null, area: null, valor_m2: null, responsable: null, documento_contractual: 'NO_APLICA', contrato_conjunto: null, ofertas: [] }, contrato: null, diferencias: [] });
    expect(x.desglose_indice).toBeNull();
    expect(x.comparacion).toEqual([]);
    expect(x.nota_comparacion).toBe('Aún no hay ofertas documentadas para este edificio.');
    expect(x.nota).toBe('Aún no hay valor ni área documentados para este edificio.');
  });
});
