import { completarConOcr, EjecutorOcr } from './contratacion-ocr';

const falso = (textos: Record<number, string>, disponible = true): EjecutorOcr & { llamadas: number[][] } => {
  const e: any = {
    llamadas: [],
    disponible: () => disponible,
    paginas: (_b: Buffer, ps: number[]) => {
      e.llamadas.push(ps);
      return ps.map((p) => textos[p] ?? '');
    },
  };
  return e;
};
const pdf = async () => Buffer.from('x');

describe('OCR local por versión y página', () => {
  it('lee solo las páginas sin texto nativo y las guarda', async () => {
    const ej = falso({ 2: 'RESOLUCION 4163 escaneada' });
    const guardadas: [number, string][] = [];
    const r = await completarConOcr({
      ejecutor: ej,
      pdf,
      paginas: [{ pagina: 1, texto: 'Texto nativo suficientemente largo de la primera página' }, { pagina: 2, texto: '' }],
      cache: async () => null,
      guardar: async (p, t) => {
        guardadas.push([p, t]);
      },
    });
    expect(ej.llamadas).toEqual([[2]]);
    expect(r.paginas[0].texto).toContain('nativo');
    expect(r.paginas[1].texto).toBe('RESOLUCION 4163 escaneada');
    expect(guardadas).toEqual([[2, 'RESOLUCION 4163 escaneada']]);
    expect(r.ocr).toBe(1);
  });
  it('reutiliza lo guardado y no repite el OCR', async () => {
    const ej = falso({});
    const r = await completarConOcr({
      ejecutor: ej, pdf, paginas: [{ pagina: 1, texto: '' }],
      cache: async () => 'texto ya guardado',
      guardar: async () => { throw new Error('no debe guardar'); },
    });
    expect(ej.llamadas).toEqual([]);
    expect(r.desdeCache).toBe(1);
    expect(r.paginas[0].texto).toBe('texto ya guardado');
  });
  it('sin motor disponible conserva el texto nativo y no falla', async () => {
    const r = await completarConOcr({ ejecutor: falso({}, false), pdf, paginas: [{ pagina: 1, texto: '' }], cache: async () => null, guardar: async () => undefined });
    expect(r.ocr).toBe(0);
    expect(r.paginas[0].texto).toBe('');
  });
  it('si el OCR devuelve vacío no guarda nada', async () => {
    const r = await completarConOcr({
      ejecutor: falso({ 1: '' }), pdf, paginas: [{ pagina: 1, texto: '' }], cache: async () => null,
      guardar: async () => { throw new Error('no debe guardar'); },
    });
    expect(r.ocr).toBe(0);
  });
});
