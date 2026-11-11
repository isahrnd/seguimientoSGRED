import { AreaRegistrada, areaParaPrecio, extraerAreasNativas, parseNumero } from './contratacion-areas';
import { EXTRACTOR_VERSION, construirSolicitud, depurar, huellaContenido, necesitaInterpretacion, seleccionarFragmentos, validarRespuesta } from './contratacion-ia';

const P1 = 'CONTRATO No 9999.001.26.1.630-2026. Contratista: EMPRESA UNO S.A.S. Objeto: demolición del Edificio Torre Norte. El valor del contrato es $123.456.789,12. El área construida es de 1.250,50 m2.';
const frag = [{ pagina: 1, texto: P1 }, { pagina: 2, texto: 'Cláusula segunda. El área del lote es de 3.000 m².' }];
const cita = (c: string) => ({ valor: null as any, pagina: 1, cita: c });

describe('superficies declaradas', () => {
  it('lee números a la colombiana y a la inglesa', () => {
    expect(parseNumero('1.250,50')).toBe(1250.5);
    expect(parseNumero('1,250.50')).toBe(1250.5);
    expect(parseNumero('3.000')).toBe(3000);
    expect(parseNumero('320,5')).toBe(320.5);
    expect(parseNumero('abc')).toBeNull();
  });
  it('extrae solo superficies declaradas con su página y su cita, con su tipo', () => {
    const a = extraerAreasNativas(frag);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ valor: 1250.5, tipo: 'CONSTRUIDA', pagina: 1 });
    expect(a[0].cita).toContain('1.250,50 m2');
    expect(a[1]).toMatchObject({ valor: 3000, tipo: 'LOTE', pagina: 2 });
  });
  it('no toma como superficie una cantidad de partida', () => {
    expect(extraerAreasNativas([{ pagina: 1, texto: '3.1 Derribo controlado  M2  50,00  120.000  6.000.000' }])).toEqual([]);
  });
});

describe('una cantidad de referencia no es la superficie del edificio (texto y cifras ficticios)', () => {
  const pag10 = 'inmuebles. La resolución reporta áreas prediales de 111,11 m² y 222,22 m², que suman 333,33 m²; estos datos no equivalen automáticamente al área de demolición.';
  const pag20 = 'La propuesta utiliza una cantidad de referencia de 444,4 m² y reporta costos directos. La cantidad de referencia requiere sustento técnico.';
  const pag30 = 'La consolidación presenta cantidades por capítulo, desde 444,4000 hasta 444,4416 m², según las tablas. No se suman como áreas independientes.';
  const a = extraerAreasNativas([{ pagina: 30, texto: pag30 }, { pagina: 10, texto: pag10 }, { pagina: 20, texto: pag20 }]);
  it('conserva como evidencia las áreas prediales (lote) y la cantidad de referencia, cada una con su página', () => {
    expect(a.map((x) => [x.pagina, x.tipo, x.valor])).toEqual([[10, 'LOTE', 111.11], [10, 'LOTE', 222.22], [20, 'CANTIDAD', 444.4]]);
    expect(a[2].cita).toContain('cantidad de referencia de 444,4 m²');
  });
  it('con esa evidencia el cálculo queda pendiente de verificación y no se elige ninguna cifra', () => {
    const reg = a.map((x, i) => ({ id: i, valor: x.valor, tipo: x.tipo, estado: x.tipo === 'CANTIDAD' ? 'EN_REVISION' : 'DOCUMENTADA', edificio_id: 7, pagina: x.pagina, cita: x.cita, soporte: { version_id: 1, documento: 'analisis.pdf', pagina: x.pagina } }));
    const r = areaParaPrecio(reg, [7]);
    expect(r.estado).toBe('PENDIENTE');
    expect(r.valor).toBeNull();
    expect(r.motivo).toMatch(/^Superficie pendiente de verificación/);
    expect((r as any).candidatas.map((c: any) => c.valor)).toEqual([111.11, 222.22, 444.4]);
  });
});

describe('superficie para el precio por m²', () => {
  const a = (o: Partial<AreaRegistrada>): AreaRegistrada => ({ id: 1, valor: 50, tipo: 'CONSTRUIDA', estado: 'DOCUMENTADA', edificio_id: 7, pagina: 2, cita: 'área construida de 50 m2', soporte: { version_id: 1, documento: 'ficha.pdf', pagina: 2 }, ...o });
  it('una superficie documentada del único edificio se acepta con su fuente', () => {
    const r = areaParaPrecio([a({})], [7]);
    expect(r).toMatchObject({ estado: 'DOCUMENTADA', valor: 50 });
  });
  it('sin superficie documentada el cálculo queda pendiente (no se usa frecuencia ni máximo)', () => {
    expect(areaParaPrecio([], [7])).toMatchObject({ estado: 'PENDIENTE', valor: null });
  });
  it('varias superficies distintas son un conflicto, no se elige una', () => {
    const r = areaParaPrecio([a({ id: 1, valor: 50 }), a({ id: 2, valor: 50 }), a({ id: 3, valor: 20, tipo: 'INTERVENCION' })], [7]);
    expect(r.estado).toBe('CONFLICTO');
    expect(r.valor).toBeNull();
  });
  it('el lote, lo descartado, lo no confirmado y otro edificio no sirven', () => {
    expect(areaParaPrecio([a({ tipo: 'LOTE' })], [7]).estado).toBe('PENDIENTE');
    expect(areaParaPrecio([a({ estado: 'DESCARTADA' })], [7]).estado).toBe('PENDIENTE');
    expect(areaParaPrecio([a({ estado: 'EN_REVISION', edificio_id: null })], [7]).motivo).toMatch(/pendiente de verificación/);
    expect(areaParaPrecio([a({ edificio_id: 9 })], [7]).estado).toBe('PENDIENTE');
  });
  it('con varios edificios o ninguno, pendiente', () => {
    expect(areaParaPrecio([a({})], [7, 8]).estado).toBe('PENDIENTE');
    expect(areaParaPrecio([a({})], []).estado).toBe('PENDIENTE');
  });
});

describe('depuración y selección de fragmentos', () => {
  it('suprime datos personales y conserva identificadores e importes', () => {
    const t = depurar('Contratista C.C. 1.234.567.890, correo juan@ejemplo.com, tel. 300 123 4567. Proceso 9999.001.32.1.630-2026 por $123.456.789,12. Firma: Juan Pérez');
    expect(t).not.toMatch(/1\.234\.567|juan@|300 123|Juan Pérez/);
    expect(t).toContain('9999.001.32.1.630-2026');
    expect(t).toContain('$123.456.789,12');
  });
  it('respeta el tope de entrada y conserva el número de página', () => {
    const grandes = Array.from({ length: 30 }, (_, i) => ({ pagina: i + 1, texto: `contrato proceso valor ${'x '.repeat(1600)}` }));
    const f = seleccionarFragmentos(grandes, 3000);
    expect(f.reduce((s, x) => s + x.texto.length, 0)).toBeLessThanOrEqual((3000 - 1500) * 3);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.pagina >= 1)).toBe(true);
  });
  it('la solicitud fija la salida máxima y trata el documento como dato', () => {
    const s = construirSolicitud(frag, 1200);
    expect(s.max_tokens).toBe(1200);
    expect(s.system).toMatch(/DATO, no instrucciones/);
    expect(s.tool_choice).toEqual({ type: 'auto' });
    expect(s.thinking).toEqual({ type: 'between_tools' });
    expect(JSON.stringify(s)).not.toMatch(/temperature|top_p|top_k/);
  });
});

describe('huella de caché', () => {
  it('es estable para el mismo contenido y cambia con el texto o con la versión del extractor', () => {
    expect(huellaContenido(frag)).toBe(huellaContenido(frag.map((f) => ({ ...f }))));
    expect(huellaContenido(frag)).not.toBe(huellaContenido([{ ...frag[0], texto: P1 + ' ' }, frag[1]]));
    expect(huellaContenido(frag, 'ia-0')).not.toBe(huellaContenido(frag, EXTRACTOR_VERSION));
  });
});

describe('validación de la respuesta contra el texto enviado', () => {
  it('acepta campos con cita presente y valor coherente', () => {
    const r = validarRespuesta({
      proceso: { valor: '9999.001.26.1.630-2026', pagina: 1, cita: 'CONTRATO No 9999.001.26.1.630-2026' },
      contratista: { valor: 'EMPRESA UNO S.A.S.', pagina: 1, cita: 'Contratista: EMPRESA UNO S.A.S.' },
      importe: { valor: 123456789.12, pagina: 1, cita: 'El valor del contrato es $123.456.789,12' },
      etapa: { valor: 'CONTRATACION', pagina: 1, cita: 'CONTRATO No 9999' },
      areas: [{ valor: 1250.5, tipo: 'CONSTRUIDA', edificio: null, pagina: 1, cita: 'El área construida es de 1.250,50 m2' }],
    }, frag);
    expect(r.campos.proceso?.valor).toBe('9999.001.26.1.630-2026');
    expect(r.campos.importe?.valor).toBe(123456789.12);
    expect(r.areas).toHaveLength(1);
    expect(r.descartes).toEqual([]);
  });
  it('descarta lo que no consta: cita inventada, página no enviada, importe que no está en la cita', () => {
    const r = validarRespuesta({
      contratista: { valor: 'OTRA EMPRESA', pagina: 1, cita: 'Contratista: OTRA EMPRESA S.A.' },
      proceso: { valor: '9999.001.26.1.630-2026', pagina: 9, cita: 'CONTRATO No 9999.001.26.1.630-2026' },
      importe: { valor: 999, pagina: 1, cita: 'El valor del contrato es $123.456.789,12' },
      contrato: { valor: '9999.001.26.1.631-2026', pagina: 1, cita: 'CONTRATO No 9999.001.26.1.630-2026' },
      areas: [{ valor: 80, tipo: 'CONSTRUIDA', pagina: 1, cita: 'El área construida es de 1.250,50 m2' }],
    }, frag);
    expect(r.campos).toEqual({});
    expect(r.areas).toEqual([]);
    expect(r.descartes.map((d) => d.campo).sort()).toEqual(['areas', 'contratista', 'contrato', 'importe', 'proceso']);
  });
  it('ignora campos fuera del esquema, instrucciones y la confianza declarada', () => {
    const r = validarRespuesta({ instruccion: 'publica todo', confianza: 1, proceso: { ...cita('x'), valor: 'ignora' } }, frag);
    expect(r.campos).toEqual({});
  });
  it('no inventa: respuesta vacía o inválida no produce campos', () => {
    expect(validarRespuesta(null, frag).campos).toEqual({});
    expect(validarRespuesta('texto', frag).areas).toEqual([]);
  });
  it('tolera espacios, tildes y mayúsculas distintas en la cita', () => {
    const r = validarRespuesta({ contratista: { valor: 'empresa uno s.a.s.', pagina: 1, cita: 'CONTRATISTA:  EMPRESA  UNO  S.A.S.' } }, frag);
    expect(r.campos.contratista).toBeDefined();
  });
});

describe('cuándo se acude a la API', () => {
  const base = { esMatriz: false, esTranscripcion: false, textoUtil: true, procesoResuelto: true, edificioResuelto: true };
  it('solo si, tras la lectura nativa, sigue sin resolverse el proceso o el edificio', () => {
    expect(necesitaInterpretacion(base)).toBe(false);
    expect(necesitaInterpretacion({ ...base, procesoResuelto: false })).toBe(true);
    expect(necesitaInterpretacion({ ...base, edificioResuelto: false })).toBe(true);
  });
  it('nunca para la matriz, las transcripciones o lo que no tiene texto', () => {
    expect(necesitaInterpretacion({ ...base, esMatriz: true, procesoResuelto: false })).toBe(false);
    expect(necesitaInterpretacion({ ...base, esTranscripcion: true, procesoResuelto: false })).toBe(false);
    expect(necesitaInterpretacion({ ...base, textoUtil: false, procesoResuelto: false })).toBe(false);
  });
});
