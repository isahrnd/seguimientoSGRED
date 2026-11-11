import { extraerProceso } from './contratacion-clasificador';
import { contratoUnico, extraerIdentificadores, procesoUnico, resumirIdentificadores, tipoPorSegmento } from './contratacion-identificadores';
import { validarRespuesta } from './contratacion-ia';

// Números ficticios con la estructura municipal: .32. = proceso, .26. = contrato, .21. = resolución, .27. = convenio.
const PROC = '9999.001.32.1.501-2030';
const CONT = '9999.001.26.1.501-2030';

describe('número de proceso y número de contrato', () => {
  it('solo contrato: no hay proceso (el contrato no se convierte en proceso)', () => {
    const t = `CONTRATO No. ${CONT}. Contratista: EMPRESA UNO S.A.S.`;
    expect(procesoUnico(t)).toBeNull();
    expect(extraerProceso(t)).toBeNull();
    expect(contratoUnico(t)).toBe(CONT);
    const r = resumirIdentificadores(t);
    expect(r.procesos).toEqual([]);
    expect(r.contratos).toEqual([CONT]);
  });

  it('solo proceso: hay proceso y no hay contrato', () => {
    const t = `Número del proceso: ${PROC}. Fecha: 01/02/2030`;
    expect(extraerProceso(t)).toBe(PROC);
    expect(contratoUnico(t)).toBeNull();
  });

  it('ambos números: cada uno en su lugar, también cuando el contrato va primero', () => {
    const t = `CONTRATO No. ${CONT} derivado del proceso de selección ${PROC}`;
    expect(extraerProceso(t)).toBe(PROC);
    expect(contratoUnico(t)).toBe(CONT);
  });

  it('acepta espacios alrededor del guion y no confunde resoluciones ni convenios con procesos', () => {
    expect(contratoUnico('CONTRATO No 9999.001.26.1.501 - 2030')).toBe(CONT);
    const t = 'Resolución 9999.001.21.1.344 - 2030 y convenio 9999.001.27.1.005-2030';
    expect(extraerProceso(t)).toBeNull();
    expect(resumirIdentificadores(t).ambiguos).toHaveLength(0);
    expect(tipoPorSegmento('9999.001.21.1.344-2030')).toBe('RESOLUCION');
    expect(tipoPorSegmento('9999.001.27.1.005-2030')).toBe('CONVENIO');
  });

  it('números contradictorios: dos procesos distintos no se resuelven; la etiqueta contraria al segmento tampoco', () => {
    expect(extraerProceso(`proceso ${PROC} y proceso 9999.001.32.1.502-2030`)).toBeNull();
    expect(resumirIdentificadores(`proceso ${PROC} y proceso 9999.001.32.1.502-2030`).contradictorios.procesos).toBe(true);
    // «proceso» + número de contrato: ni proceso ni contrato firmes.
    const t = `Número del proceso: ${CONT}`;
    expect(extraerProceso(t)).toBeNull();
    expect(contratoUnico(t)).toBeNull();
    const a = extraerIdentificadores(t)[0];
    expect(a).toMatchObject({ ambiguo: true, tipo: null, tipo_segmento: 'CONTRATO', tipo_etiqueta: 'PROCESO' });
    expect(a.motivo).toMatch(/etiqueta indica proceso/);
    // «contrato» + número de proceso.
    expect(contratoUnico(`Contrato No. ${PROC}`)).toBeNull();
    expect(extraerProceso(`Contrato No. ${PROC}`)).toBeNull();
  });

  it('el mismo número repetido no es contradicción', () => {
    expect(extraerProceso(`Proceso ${PROC}. Ver proceso ${PROC}`)).toBe(PROC);
  });

  it('segmento desconocido: ambiguo, aunque tenga etiqueta', () => {
    const r = extraerIdentificadores('proceso 9999.001.45.1.501-2030');
    expect(r[0]).toMatchObject({ ambiguo: true, tipo: null, tipo_segmento: null });
    expect(extraerProceso('proceso 9999.001.45.1.501-2030')).toBeNull();
  });

  it('OCR ambiguo: letras por dígitos o comas por puntos no producen ningún número utilizable', () => {
    for (const t of ['proceso 9999.001.3Z.1.501-2030', 'proceso 9999.0O1.32.1.501-2030', 'proceso 9999,001,32,1,501-2030', 'Contrato 9999.001.26.l.501-2O3O', 'proceso 9999 001 32 1 501-2030']) {
      const r = resumirIdentificadores(t);
      expect([t, r.procesos, r.contratos]).toEqual([t, [], []]);
      expect(r.ambiguos.length).toBeGreaterThan(0);
      expect(r.ambiguos[0].valor).toBeNull();
      expect(extraerProceso(t)).toBeNull();
    }
  });

  it('el proceso de un texto con contrato y OCR dudoso del proceso sigue sin resolverse', () => {
    const t = `CONTRATO No. ${CONT}. Proceso 9999.001.3Z.1.501-2030`;
    expect(extraerProceso(t)).toBeNull();
    expect(contratoUnico(t)).toBe(CONT);
  });
});

describe('lectura asistida: el proceso y el contrato no se intercambian', () => {
  const pag = [{ pagina: 1, texto: `CONTRATO No ${CONT}. Proceso ${PROC}.` }];
  it('acepta cada número solo en su campo', () => {
    const r = validarRespuesta({
      proceso: { valor: PROC, pagina: 1, cita: `Proceso ${PROC}` },
      contrato: { valor: CONT, pagina: 1, cita: `CONTRATO No ${CONT}` },
    }, pag);
    expect(r.campos.proceso?.valor).toBe(PROC);
    expect(r.campos.contrato?.valor).toBe(CONT);
  });
  it('descarta el contrato en el campo de proceso y el proceso en el campo de contrato', () => {
    const r = validarRespuesta({
      proceso: { valor: CONT, pagina: 1, cita: `CONTRATO No ${CONT}` },
      contrato: { valor: PROC, pagina: 1, cita: `Proceso ${PROC}` },
    }, pag);
    expect(r.campos).toEqual({});
    expect(r.descartes.map((d) => d.campo).sort()).toEqual(['contrato', 'proceso']);
  });
});
