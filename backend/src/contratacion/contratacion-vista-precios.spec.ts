import { marcarSecuencia, compararOfertas, construirFila, cop, etiquetaConsolidado, EntradaFila, OfertaEdificio } from './contratacion-vista-precios';

// Datos SINTÉTICOS.
const F = (documento: string, extra: Partial<{ pagina: number; hoja: string; celda: string }> = {}) => ({ version_id: 1, documento, pagina: null, hoja: null, celda: null, ...extra });
const consolidado = (o: any = {}) => ({
  id: 1, nombre: 'Edificio Alfa', direccion: 'Carrera 1 # 2-3', estado: 'CONTRATADO', avance: 'COMPLETADO', valor: 100_000_000, area_m2: 500, valor_m2: 200_000, responsable: 'EMPRESA A',
  formula_valor: null, fecha_corte: '2026-11-11', vinculo: 'NOMBRE_EXACTO',
  fuentes: { valor: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'E2' }), area_m2: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'F2' }), valor_m2: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'G2' }), responsable: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'H2' }), estado: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'C2' }) },
  ...o,
});
const entrada = (o: Partial<EntradaFila> = {}): EntradaFila => ({
  edificio: { id: 7, nombre: 'Edificio Alfa', direccion: null }, consolidado: null, procesos: [], area_documentada: null, ofertas: [], contrato_por_vincular: false, analisis_sector: false, ...o,
});
const proceso = (o: any = {}) => ({ id: 3, proceso: 'P-1', numero_contrato: 'C-1', intervencion: 'Demolición', edificios_del_proceso: 1, contratos: [], reportado_matriz: null, presupuesto_oficial: null, ...o });

describe('vista de precios por edificio', () => {
  it('sin contrato: el valor del consolidado es «reportado», con su fuente, y el estado del consolidado no se presenta como contrato verificado', () => {
    const f = construirFila(entrada({ consolidado: consolidado(), procesos: [proceso({ reportado_matriz: { importe: 100_000_000.26, soporte: F('matriz.xlsx', { hoja: 'COMPRAS', celda: 'F6' }) } })] }));
    expect(f.valor).toMatchObject({ valor: 100_000_000, procedencia: 'CONSOLIDADO', etiqueta: 'Según consolidado del 11/11/2026' });
    expect(f.valor!.fuente).toMatchObject({ hoja: 'Hoja1', celda: 'E2' });
    expect(f.estado).toMatchObject({ etiqueta: 'Contratado (consolidado)', consolidado: 'Contratado', avance: 'Completado' });
    expect(f.documento_contractual).toBe('POR_INCORPORAR');
    expect(f.mensajes).toContain('Documento contractual por incorporar');
    // la cifra de la matriz se conserva aparte y la diferencia se informa sin inventar su causa
    expect(f.valores_alternos).toEqual([expect.objectContaining({ valor: 100_000_000.26, procedencia: 'MATRIZ' })]);
    expect(f.diferencias).toHaveLength(1);
    expect(f.diferencias[0]).toContain('diferencia de $0,26');
    expect(f.diferencias[0]).toContain('No consta la causa');
  });

  it('valor/m² reportado: se muestra como reportado y no como «valor contratado por m²»', () => {
    const f = construirFila(entrada({ consolidado: consolidado() }));
    expect(f.area).toMatchObject({ valor: 500, clase: 'REPORTADA' });
    expect(f.valor_m2).toMatchObject({ valor: 200_000, clase: 'REPORTADO' });
    expect(f.valor_m2!.etiqueta).toMatch(/reportado/i);
    expect(f.valor_m2!.etiqueta).not.toMatch(/contratado/i);
  });

  it('contrato de un único edificio con área documentada: «Valor contratado por m²» y el contrato prevalece como valor principal', () => {
    const f = construirFila(entrada({
      consolidado: consolidado({ valor: 99_000_000 }),
      procesos: [proceso({ contratos: [{ valor: 90_000_000, tipo_acto: 'Contrato', numero: 'C-1', contratista: 'EMPRESA B', soporte: F('contrato.pdf', { pagina: 1 }) }] })],
      area_documentada: { valor: 300, tipo: 'DEMOLICION', cita: 'área de 300 m²', fuente: F('resolucion.pdf', { pagina: 4 }) },
    }));
    expect(f.valor).toMatchObject({ valor: 90_000_000, procedencia: 'CONTRATO' });
    expect(f.valor_m2).toMatchObject({ valor: 300_000, clase: 'CONTRATADO', etiqueta: 'Valor contratado por m²' });
    expect(f.documento_contractual).toBe('RESPALDADO');
    expect(f.estado.etiqueta).toBe('Contrato respaldado');
    expect(f.valores_alternos).toEqual([expect.objectContaining({ procedencia: 'CONSOLIDADO', valor: 99_000_000 })]);
    // el consolidado reporta otra área: se informa la diferencia
    expect(f.diferencias.join(' ')).toMatch(/Área documentada 300 m² y área del consolidado 500 m²/);
  });

  it('un contrato que cubre varios edificios se muestra como conjunto: su valor no se asigna al edificio ni se divide por su área', () => {
    const f = construirFila(entrada({
      procesos: [proceso({ edificios_del_proceso: 3, contratos: [{ valor: 300_000_000, tipo_acto: 'Contrato', numero: 'C-9', contratista: 'EMPRESA C', soporte: F('c9.pdf', { pagina: 1 }) }] })],
      consolidado: consolidado({ valor: null, valor_m2: null }),
    }));
    expect(f.valor).toBeNull();
    expect(f.contrato_conjunto).toMatchObject({ valor: 300_000_000, edificios: 3, proceso: 'P-1' });
    expect(f.contrato_conjunto!.nota).toMatch(/no se divide/);
    expect(f.valor_m2).toBeNull();
    expect(f.documento_contractual).toBe('CONJUNTO');
    expect(f.responsable).toMatchObject({ nombre: 'EMPRESA A', procedencia: 'CONSOLIDADO' });
  });

  it('sin área: «Área por precisar» y sin valor por m²; un contrato por vincular se distingue de uno por incorporar', () => {
    const f = construirFila(entrada({ procesos: [proceso()], contrato_por_vincular: true }));
    expect(f.area).toBeNull();
    expect(f.valor_m2).toBeNull();
    expect(f.mensajes).toEqual(expect.arrayContaining(['Documento contractual por vincular', 'Área por precisar']));
    expect(f.mensajes).not.toContain('Documento contractual por incorporar');
  });

  it('un edificio sin ningún dato no inventa mensajes de contrato', () => {
    const f = construirFila(entrada());
    expect(f.documento_contractual).toBe('NO_APLICA');
    expect(f.mensajes).toEqual(['Área por precisar']);
    expect(f.valor).toBeNull();
  });

  it('el análisis del sector se menciona solo si existe', () => {
    expect(construirFila(entrada({ analisis_sector: true })).mensajes).toContain('Se cuenta con análisis del sector');
    expect(construirFila(entrada()).mensajes.join(' ')).not.toMatch(/análisis del sector/i);
  });

  it('una discrepancia entre el valor por m² del consolidado y valor ÷ área se informa', () => {
    const f = construirFila(entrada({ consolidado: consolidado({ valor_m2: 210_000 }) }));
    expect(f.valor_m2!.valor).toBe(210_000);
    expect(f.diferencias.join(' ')).toMatch(/distinto del cociente/);
  });
});

describe('evolución por etapa', () => {
  const o = (empresa: string, total: number) => ({
    empresa, documento: `${empresa}.pdf`, version_id: 1, etapa: 'COTIZACION' as const, fecha: null, referencia: null, nivel: 'TOTAL' as const, items: [],
    componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total }, fuentes_componentes: {}, alcance: null, oferta_conjunta: null, secuencia: null, nota_version: null, relacion: 'x', controles: [],
  });
  it('cotización y consolidado no declaran el mismo nivel: se listan, pero no se grafican juntos', () => {
    const f = construirFila(entrada({ consolidado: consolidado(), ofertas: [o('A', 130_000_000)] }));
    expect(f.etapas.map((e) => e.procedencia).sort()).toEqual(['CONSOLIDADO', 'COTIZACION']);
    expect(f.etapas_comparables).toBe(false);
  });
  it('dos cotizaciones del mismo nivel sí son comparables', () => {
    const f = construirFila(entrada({ ofertas: [o('A', 130_000_000), o('B', 150_000_000)] }));
    expect(f.etapas_comparables).toBe(true);
  });
});

describe('comparación de ofertas por nivel', () => {
  const oferta = (empresa: string, cd: number | null, total: number | null, nivel: any = 'COSTO_DIRECTO'): OfertaEdificio => ({
    empresa, documento: `${empresa}.pdf`, version_id: 1, etapa: 'COTIZACION', fecha: null, referencia: null, nivel, items: [],
    componentes: { costo_directo: cd, administracion: null, imprevistos: null, utilidad: null, iva: null, total }, fuentes_componentes: {}, alcance: null, oferta_conjunta: null, secuencia: null, nota_version: null, relacion: 'x', controles: [],
  });
  it('compara solo cifras del mismo nivel y no mezcla costo directo con total', () => {
    const c = compararOfertas([oferta('A', 100, 130), oferta('B', 120, null), oferta('C', null, 150)]);
    expect(c.disponible).toBe(true);
    expect(c.niveles.map((n) => [n.nivel, n.ofertas.length, n.minimo, n.maximo])).toEqual([['COSTO_DIRECTO', 2, 100, 120], ['TOTAL', 2, 130, 150]]);
    expect(c.nota).toMatch(/no es un veredicto/);
  });
  it('con una sola oferta por nivel no hay comparación', () => {
    const c = compararOfertas([oferta('A', 100, 130)]);
    expect(c.disponible).toBe(false);
    expect(c.niveles).toEqual([]);
  });
  it('dos versiones de la misma empresa no cuentan como dos ofertas', () => {
    expect(compararOfertas([oferta('A', 100, null), { ...oferta('A', 110, null), documento: 'A-v2.pdf' }]).disponible).toBe(false);
  });
});

describe('versiones de una misma oferta', () => {
  const v = (empresa: string, fecha: string | null, doc: string): OfertaEdificio => ({
    empresa, documento: doc, version_id: 1, etapa: 'COTIZACION', fecha, referencia: null, nivel: 'TOTAL', items: [],
    componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: 100 }, fuentes_componentes: {}, alcance: null, oferta_conjunta: null, secuencia: null, nota_version: null, relacion: 'x', controles: [],
  });
  it('distingue anterior y posterior por fecha, conserva ambas y no marca ninguna como seleccionada', () => {
    const r = marcarSecuencia([v('A', '2026-10-20', 'A-v2.pdf'), v('A', '2026-09-18', 'A-v1.pdf'), v('B', '2026-09-30', 'B.pdf')]);
    expect(r.map((o) => [o.documento, o.secuencia])).toEqual([['A-v1.pdf', 'ANTERIOR'], ['B.pdf', null], ['A-v2.pdf', 'POSTERIOR']]);
    expect(JSON.stringify(r)).not.toMatch(/seleccionad|contratad/i);
  });
  it('sin fecha en alguna versión no se afirma el orden', () => {
    const r = marcarSecuencia([v('A', null, 'A-v1.pdf'), v('A', '2026-10-20', 'A-v2.pdf')]);
    expect(r.every((o) => o.secuencia === null)).toBe(true);
  });
  it('la comparación usa la etiqueta con fecha cuando hay varias versiones', () => {
    const r = marcarSecuencia([v('A', '2026-09-18', 'A-v1.pdf'), v('A', '2026-10-20', 'A-v2.pdf'), v('B', '2026-09-30', 'B.pdf')]);
    const c = compararOfertas(r);
    expect(c.niveles[0].ofertas.map((o) => o.etiqueta).join('|')).toContain("A · 18/09/2026");
  });
});

describe('formato', () => {
  it('pesos con centavos solo si existen y fecha de corte', () => {
    expect(cop(123456789)).toBe('$123.456.789');
    expect(cop(123456789.26)).toBe('$123.456.789,26');
    expect(etiquetaConsolidado('2026-11-11')).toBe('Según consolidado del 11/11/2026');
    expect(etiquetaConsolidado(null)).toBe('Según consolidado');
  });
});
