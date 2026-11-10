import { decidir, detectarFirma, extraerContrato, parsearImporte, puntuar, ExpedienteCandidato } from './contratacion-contratos';

// Textos ficticios con la misma forma que los contratos reales (espacios dentro de las palabras incluidos).
const pagina1 = (o: { numero?: string; contratista?: string; objeto?: string; valor?: string; extra?: string }) =>
  `GESTIÓN CONTRACTUAL CONTRA TO DE SERVICIOS CONTRA TO No . ${o.numero ?? '4163.001.26.1.900 - 2026'} CONTRA TANTE: DISTRITO ` +
  `CONTRA TISTA: ${o.contratista ?? 'JUAN PEREZ , C.C.# 1.000.000.001 R/L. ACME GRUAS SAS NIT 900000001 - 1'} ` +
  `OBJET O: “${o.objeto ?? 'CONTRATAR EL SERVICIO DE ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS'}” ` +
  `VALOR: ${o.valor ?? 'CIEN PESOS M/CTE ($100.000.000)'}. Entre los suscritos ${o.extra ?? ''}`;
const clausula = (v: string) => `... CLÁUSULA TERCERA: VALOR. El valor del presente Contrato corresponde a la suma de ${v} incluidos impuestos`;
const firmas = (n: number, fecha = '') => `${fecha} EL CONTRATANTE: ${n > 0 ? 'Firmado electrónicamente' : ''} A. B. EL CONTRATISTA: ${n > 1 ? 'Firmado electrónicamente' : ''} C. D.`;

describe('lectura de contratos: encabezado y cláusula de valor', () => {
  it('separa número de contrato, consecutivo y año, y lee el valor del encabezado', () => {
    const c = extraerContrato([pagina1({}), clausula('CIEN PESOS M/CTE ($100.000.000)'), firmas(2)])!;
    expect(c.numero_contrato).toBe('4163.001.26.1.900-2026');
    expect(c.consecutivo).toBe('900');
    expect(c.anio).toBe(2026);
    expect(c.valor).toBe(100000000);
    expect(c.valor_clausula).toBe(100000000);
    expect(c.pagina_clausula).toBe(2);
    expect(c.advertencias).toEqual([]);
    expect(c.proceso_citado).toBeNull();
  });
  it('conserva la expresión «valor estimado del contrato»', () => {
    const c = extraerContrato([pagina1({ valor: 'El valor estimado del contrato es de CIEN PESOS M/CTE($ 100.000.000), incluidos impuestos' }), clausula('($100.000.000)')])!;
    expect(c.expresion_valor).toBe('valor estimado del contrato');
  });
  it('interpreta importes con decimales y sufijos (.oo) y descarta CDP y otras cifras', () => {
    expect(parsearImporte('($ 555.555.555,50).')).toBe(555555555.5);
    expect(parsearImporte('($ 666.666.600 .oo ). incluidos')).toBe(666666600);
    // La cifra del encabezado es la primera tras «VALOR:»; un CDP posterior no se confunde con ella.
    const c = extraerContrato([pagina1({ extra: 'CDP No. 1 Valor: ($ 4.864.000.000)' }), clausula('($100.000.000)')])!;
    expect(c.valor).toBe(100000000);
  });
  it('advierte si el encabezado y la cláusula de valor no coinciden', () => {
    const c = extraerContrato([pagina1({}), clausula('($ 99.000.000)')])!;
    expect(c.advertencias.join(' ')).toMatch(/no coincide/);
  });
  it('detecta el número de proceso citado dentro del contrato', () => {
    const c = extraerContrato([pagina1({ extra: 'proceso de contratación directa Nº 4163.001.32.1.900-2026' }), clausula('($100.000.000)')])!;
    expect(c.proceso_citado).toBe('4163.001.32.1.900-2026');
  });
  it('una página que no es un contrato no se interpreta', () => {
    expect(extraerContrato(['COTIZACIÓN 116 PROPUESTA ECONÓMICA VALOR: $1.000'])).toBeNull();
  });
});

describe('evidencia de firma', () => {
  it('ambas partes con fecha', () => {
    const f = detectarFirma([firmas(2, 'Dado en Cali a los Dieci nueve (1 9 ) días del mes octubre de 2026.')]);
    expect(f.estado).toBe('FIRMADO_ELECTRONICAMENTE');
    expect(f.fecha).toBe('2026-10-19');
  });
  it('ambas partes sin fecha: indica qué falta', () => {
    const f = detectarFirma([firmas(2)]);
    expect(f.fecha).toBeNull();
    expect(f.detalle).toMatch(/fecha de suscripción|SECOP II/);
  });
  it('una sola marca → firma parcial; ninguna → sin evidencia', () => {
    expect(detectarFirma([firmas(1)]).estado).toBe('FIRMA_PARCIAL');
    expect(detectarFirma([firmas(0)]).estado).toBe('SIN_EVIDENCIA_DE_FIRMA');
  });
});

describe('asociación contrato ↔ expediente', () => {
  const exp = (id: number, proceso: string, prov: string, interv: string, numero_contrato: string | null = null): ExpedienteCandidato =>
    ({ id, proceso, numero_contrato, intervencion: interv, objeto: null, proveedores: [prov] });
  const contrato = (numero: string, contratista: string, objeto: string, proceso_citado: string | null = null) =>
    extraerContrato([pagina1({ numero, contratista, objeto, extra: proceso_citado ? `proceso Nº ${proceso_citado}` : '' }), clausula('($100.000.000)')])!;

  const lista = [
    exp(1, '4163.001.32.1.900-2026', 'ACME GRUAS S.A.S.', 'Alquiler de grúas para izaje de estructuras colapsadas'),
    exp(2, '4163.001.32.1.901-2026', 'OTRA EMPRESA S.A.S.', 'Demolición y transporte de escombros de edificaciones colapsadas'),
  ];

  it('asocia con consecutivo, contratista y objeto concordantes', () => {
    const c = contrato('4163.001.26.1.900-2026', 'JUAN PEREZ R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR EL SERVICIO DE ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS');
    const d = decidir(puntuar(c, lista));
    expect(d).toMatchObject({ tipo: 'ASOCIAR', expedienteId: 1 });
  });
  it('el nombre del contratista solo, sin consecutivo, no alcanza: queda en revisión', () => {
    const c = contrato('4163.001.26.1.902-2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS');
    expect(decidir(puntuar(c, lista)).tipo).toBe('REVISION');
  });
  it('un consecutivo que coincide con contratista y objeto de OTRO expediente es ambiguo: revisión', () => {
    const dos = [lista[0], exp(3, '4163.001.32.1.900-2026', 'ACME GRUAS S.A.S.', 'Alquiler de grúas para izaje de estructuras colapsadas')];
    const c = contrato('4163.001.26.1.900-2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS');
    const d = decidir(puntuar(c, dos));
    expect(d.tipo).toBe('REVISION');
  });
  it('sin ningún indicio propone una ficha por número de contrato', () => {
    const c = contrato('4163.001.26.1.911-2026', 'R/L. BETA INGENIEROS SAS NIT 9', 'CONTRATAR MAQUINARIA PESADA Y APOYO DE OXICORTE');
    expect(decidir(puntuar(c, lista)).tipo).toBe('NUEVA_FICHA');
  });
  it('un proceso citado en el contrato cuenta como evidencia fuerte', () => {
    const c = contrato('4163.001.26.1.555-2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS', '4163.001.32.1.900-2026');
    expect(decidir(puntuar(c, lista))).toMatchObject({ tipo: 'ASOCIAR', expedienteId: 1 });
  });
});
