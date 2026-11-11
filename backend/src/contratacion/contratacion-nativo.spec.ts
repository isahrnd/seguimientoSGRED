import { extraerNativo } from './contratacion-nativo';

// Textos ficticios con la estructura de una resolución y de una visita ATC-20.
const resolucion = [
  { pagina: 1, texto: 'RESOLUCIÓN No. 9999.001.21.1.500 DE 2030 POR LA CUAL SE ORDENA LA DEMOLICIÓN DE UN INMUEBLE' },
  { pagina: 3, texto: 'el edificio denominado CONJUNTO EJEMPLO ubicado en la calle 9 #44-11, barrio Centro. Folio de matrícula inmobiliaria matriz No. 370-169821 de la Oficina' },
  { pagina: 4, texto: 'ARTÍCULO PRIMERO. ORDENAR LA DEMOLICIÓN TOTAL del conjunto. La demolición se ejecutará de inmediato.' },
];
const visita = [{ pagina: 1, texto: 'Informe de evaluación ATC-20 Código de edificación: 76001-1-0500004 Nombre Edificio Ejemplo Dirección CRA 41 7-05 Clasificación inseguro' }];

describe('extracción nativa de resoluciones y visitas', () => {
  it('extrae intervención, resolución, dirección y matrícula con página y cita', () => {
    const r = extraerNativo(resolucion, 'RESOLUCION_DEMOLICION');
    expect(r.campos.intervencion).toMatchObject({ valor: 'DEMOLICION', pagina: 1 });
    expect(r.campos.resolucion_numero).toMatchObject({ valor: '9999.001.21.1.500-2030', pagina: 1 });
    expect(r.campos.direccion).toMatchObject({ pagina: 3 });
    expect(r.campos.direccion.valor.replace(/\s/g, '')).toBe('calle9#44-11');
    expect(r.campos.matricula_inmobiliaria).toMatchObject({ valor: '370-169821', pagina: 3 });
    expect(r.no_encontrados).toEqual([]);
  });
  it('en una visita extrae el código ATC-20 y la dirección; no inventa intervención', () => {
    const r = extraerNativo(visita, 'VISITA_SOPORTE_TECNICO');
    expect(r.campos.codigo_atc.valor).toBe('76001-1-0500004');
    expect(r.campos.direccion.valor).toMatch(/CRA 41 7-05/i);
    expect(r.campos.intervencion).toBeUndefined();
  });
  it('lo que no está se informa como «no encontrado» con su motivo, sin inventarlo', () => {
    const r = extraerNativo([{ pagina: 1, texto: 'Documento sin datos técnicos' }], 'RESOLUCION_DEMOLICION');
    expect(r.campos).toEqual({});
    expect(r.no_encontrados.map((x) => x.campo).sort()).toEqual(['direccion', 'intervencion', 'matricula_inmobiliaria', 'resolucion_numero']);
  });
  it('dos tipos de intervención igual de citados son ambiguos y no se publica ninguno', () => {
    const r = extraerNativo([{ pagina: 1, texto: 'demolición de la estructura y alquiler de una grúa' }], 'RESOLUCION_DEMOLICION');
    expect(r.campos.intervencion).toBeUndefined();
    expect(r.no_encontrados.find((x) => x.campo === 'intervencion')?.motivo).toMatch(/ambiguo/);
  });
});
