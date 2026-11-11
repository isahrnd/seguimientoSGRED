/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local), documentos ficticios y un cliente simulado:
 * lectura nativa primero, OCR selectivo, interpretación con evidencia validada, caché persistente, límites y control de concurrencia.
 */
import { PrismaClient } from '@prisma/client';
import { ClienteClaude, ErrorClaude, RespuestaClaude } from './contratacion-claude.client';
import { EXTRACTOR_VERSION } from './contratacion-ia';
import { ContratacionIaService, LecturaPdf } from './contratacion-ia.service';
import { EjecutorOcr } from './contratacion-ocr';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;
jest.setTimeout(60000);

const TEXTO = (n: number) =>
  `CONTRATO No 9999.001.26.1.${String(n).padStart(3, '0')}-2026. Proceso 9999.001.32.1.${String(n).padStart(3, '0')}-2026. Contratista: EMPRESA UNO S.A.S. C.C. 1.234.567.890 correo juan@ejemplo.com. El valor del contrato es $123.456.789,12. El área construida es de 1.250,50 m2.`;

class ClienteFalso implements ClienteClaude {
  llamadas: any[] = [];
  activo = true;
  responder: (n: number, s?: any) => RespuestaClaude | Promise<RespuestaClaude> = () => ({ entrada: null, tokens_entrada: 100, tokens_salida: 20, http: 200 });
  concurrentes = 0;
  maxConcurrentes = 0;
  disponible() { return this.activo; }
  async extraer(_m: string, s: any): Promise<RespuestaClaude> {
    this.llamadas.push(s);
    this.concurrentes++;
    this.maxConcurrentes = Math.max(this.maxConcurrentes, this.concurrentes);
    await new Promise((r) => setTimeout(r, 15));
    try { return await this.responder(this.llamadas.length, s); } finally { this.concurrentes--; }
  }
}

class OcrFalso implements EjecutorOcr {
  pedidas: number[][] = [];
  disponible() { return true; }
  paginas(_pdf: Buffer, paginas: number[]) { this.pedidas.push(paginas); return paginas.map((p) => `ESCANEADO. CONTRATO No 9999.001.26.1.700-2026. Contratista: EMPRESA UNO S.A.S. pagina ${p}`); }
}

d('lectura asistida (BD)', () => {
  let prisma: PrismaClient;
  let n = 0;
  const textos = new Map<string, string[]>();
  const bytesPorMd5 = new Map<string, Buffer>();
  const lectura: LecturaPdf = { paginas: async (md5) => textos.get(md5) ?? null, bytes: async (md5) => bytesPorMd5.get(md5) ?? Buffer.from('pdf') };
  const guardarEnv: Record<string, string | undefined> = {};

  const fijarEnv = (k: string, v: string) => { if (!(k in guardarEnv)) guardarEnv[k] = process.env[k]; process.env[k] = v; };

  async function documento(nombre: string, paginas: string[], extra: { edificio?: number; categoria?: string } = {}) {
    const md5 = String(++n).padStart(32, '0');
    textos.set(md5, paginas);
    const doc = await prisma.contratacionDocumento.create({ data: { nombre, categoria: extra.categoria ?? 'SIN_CATEGORIA' } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: ver.id, tipo: 'DRIVE', id_origen: `d-${n}`, nombre_original: nombre, mime: 'application/pdf' } });
    await prisma.contratacionDocIndice.create({ data: { version_id: ver.id, texto: paginas.join(' ').toLowerCase() } });
    if (extra.edificio) await prisma.contratacionDocumentoEdificio.create({ data: { documento_id: doc.id, edificio_id: extra.edificio } });
    return { doc, ver, md5 };
  }

  /** Respuesta válida para el texto de TEXTO(): cada dato con su cita real. */
  const respuestaBuena = (_k: number, s?: any): RespuestaClaude => {
    const n = Number(/9999\.001\.26\.1\.(\d{3})-2026/.exec(JSON.stringify(s) ?? "")?.[1] ?? 630);
    return {
    entrada: {
      proceso: { valor: `9999.001.32.1.${String(n).padStart(3, '0')}-2026`, pagina: 1, cita: `Proceso 9999.001.32.1.${String(n).padStart(3, '0')}-2026` },
      contratista: { valor: 'EMPRESA UNO S.A.S.', pagina: 1, cita: 'Contratista: EMPRESA UNO S.A.S.' },
      importe: { valor: 123456789.12, pagina: 1, cita: 'El valor del contrato es $123.456.789,12' },
      etapa: { valor: 'CONTRATACION', pagina: 1, cita: 'CONTRATO No 9999' },
      areas: [{ valor: 1250.5, tipo: 'CONSTRUIDA', edificio: null, pagina: 1, cita: 'El área construida es de 1.250,50 m2' }],
    },
    tokens_entrada: 900, tokens_salida: 150, http: 200,
    };
  };

  beforeAll(async () => { prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] }); });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    n = 0;
    textos.clear();
    bytesPorMd5.clear();
    for (const k of Object.keys(guardarEnv)) { if (guardarEnv[k] === undefined) delete process.env[k]; else process.env[k] = guardarEnv[k]; delete guardarEnv[k]; }
    process.env.SEGUIMIENTO_CLAUDE_AUTOMATICO = 'true'; // las pruebas del procesamiento automático lo activan; la pausa tiene sus propias pruebas
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_ia_extracciones, tbl_contratacion_ia_llamadas, tbl_contratacion_areas, tbl_contratacion_ocr_paginas, tbl_contratacion_doc_sugerencias, tbl_contratacion_doc_indice, tbl_contratacion_documento_edificios, tbl_contratacion_doc_origenes, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_edificios RESTART IDENTITY CASCADE');
  });
  const servicio = (c: ClienteClaude, o: EjecutorOcr = new OcrFalso()) => new ContratacionIaService(prisma as any, c, o);

  it('pausado (por defecto) no llama a la API ni siquiera con clave: queda pendiente; una ejecución manual sobre versiones concretas sí', async () => {
    delete process.env.SEGUIMIENTO_CLAUDE_AUTOMATICO;
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const a = await documento('a.pdf', [TEXTO(630)]);
    await documento('b.pdf', [TEXTO(631)]);
    const r1 = await servicio(c).procesar(lectura);
    expect(r1).toMatchObject({ llamadas: 0, pendientes: 2 });
    expect(c.llamadas).toHaveLength(0);
    expect(await prisma.contratacionIaLlamada.count()).toBe(0);
    // Manual sobre una sola versión: solo esa se interpreta; la otra sigue pendiente.
    const r2 = await servicio(c).procesar(lectura, { versiones: [a.ver.id] });
    expect(r2).toMatchObject({ llamadas: 1 });
    expect(c.llamadas).toHaveLength(1);
    expect((await prisma.contratacionIaExtraccion.findMany({ orderBy: { version_id: 'asc' } })).map((x) => x.estado)).toEqual(['OK', 'PENDIENTE_IA']);
    // Una actualización automática posterior, aún pausada, no toca la pendiente.
    const r3 = await servicio(c).procesar(lectura);
    expect(r3.llamadas).toBe(0);
    expect(c.llamadas).toHaveLength(1);
  });

  it('sin clave no consume nada: el documento queda pendiente y se interpreta cuando hay clave', async () => {
    const c = new ClienteFalso(); c.activo = false; c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    const r1 = await servicio(c).procesar(lectura);
    expect(r1).toMatchObject({ llamadas: 0, pendientes: 1 });
    expect((await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } })).estado).toBe('PENDIENTE_IA');
    c.activo = true;
    const r2 = await servicio(c).procesar(lectura);
    expect(r2.llamadas).toBe(1);
    expect(c.llamadas).toHaveLength(1);
  });

  it('acepta solo lo validado: sugerencias, superficie en revisión sin edificio y consumo registrado', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver, doc } = await documento('a.pdf', [TEXTO(630)]);
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 1, tokens_entrada: 900, tokens_salida: 150 });
    const fila = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } });
    expect(fila).toMatchObject({ estado: 'OK', extractor: EXTRACTOR_VERSION, tokens_entrada: 900 });
    expect(JSON.stringify(fila.resultado)).not.toMatch(/1\.234\.567|juan@/);
    const sug = await prisma.contratacionDocSugerencia.findMany({ where: { documento_id: doc.id } });
    expect(sug.map((s) => s.tipo).sort()).toEqual(['CATEGORIA', 'EMPRESA', 'EXPEDIENTE']);
    expect(sug.every((s) => s.estado === 'SUGERIDA' && s.fuente_detalle.startsWith('p. 1'))).toBe(true);
    // El área (nativa y de la API) coincide: una sola fila; sin edificio confirmado queda en revisión, no documentada.
    const areas = await prisma.contratacionAreaDocumentada.findMany();
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ estado: 'EN_REVISION', edificio_id: null, tipo: 'CONSTRUIDA' });
    const llamadas = await prisma.contratacionIaLlamada.findMany();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ estado: 'OK', tokens_entrada: 900, tokens_salida: 150 });
  });

  it('lo enviado a la API no lleva cédulas, correos ni firmas y respeta el tope de salida', async () => {
    fijarEnv('SEGUIMIENTO_CLAUDE_MAX_TOKENS_SALIDA', '700');
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura);
    const s = JSON.stringify(c.llamadas[0]);
    expect(s).not.toMatch(/1\.234\.567|juan@ejemplo/);
    expect(s).toContain('9999.001.26.1.630-2026');
    expect(c.llamadas[0].max_tokens).toBe(700);
  });

  it('con una superficie en un documento de un edificio confirmado, queda documentada con ese edificio', async () => {
    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Torre Norte', nombre_norm: 'torre norte' } });
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('a.pdf', [TEXTO(630)], { edificio: ed.id });
    await servicio(c).procesar(lectura);
    // Con el edificio ya confirmado y el proceso detectado en el texto, la lectura nativa basta: no hay llamada.
    expect(c.llamadas).toHaveLength(0);
    const areas = await prisma.contratacionAreaDocumentada.findMany();
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ estado: 'DOCUMENTADA', edificio_id: ed.id, origen: 'NATIVO' });
  });

  it('caché persistente: reindexar de nuevo no repite llamadas ni crea duplicados', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura);
    const contar = async () => ({ ext: await prisma.contratacionIaExtraccion.count(), sug: await prisma.contratacionDocSugerencia.count(), ar: await prisma.contratacionAreaDocumentada.count(), ll: await prisma.contratacionIaLlamada.count() });
    const antes = await contar();
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ revisadas: 0, llamadas: 0 });
    expect(c.llamadas).toHaveLength(1);
    expect(await contar()).toEqual(antes);
  });

  it('el mismo contenido en otro documento reutiliza el resultado sin llamar de nuevo', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura);
    const b = await documento('copia.pdf', [TEXTO(630)]);
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ desde_cache: 1, llamadas: 0 });
    expect(c.llamadas).toHaveLength(1);
    expect(await prisma.contratacionDocSugerencia.count({ where: { documento_id: b.doc.id } })).toBe(3);
  });

  it('una versión nueva del extractor vuelve a evaluar; la misma no', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura);
    await prisma.contratacionIaExtraccion.updateMany({ where: { version_id: ver.id }, data: { extractor: 'ia-0' } });
    const r = await servicio(c).procesar(lectura);
    expect(r.revisadas).toBe(1);
  });

  it('el límite diario es efectivo: el resto queda pendiente y no se llama', async () => {
    fijarEnv('SEGUIMIENTO_CLAUDE_MAX_LLAMADAS_DIA', '2');
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    for (let i = 0; i < 4; i++) await documento(`d${i}.pdf`, [TEXTO(600 + i)]);
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 2, limite_alcanzado: true, detenido: 'LIMITE_DIARIO' });
    expect(c.llamadas).toHaveLength(2);
    expect(await prisma.contratacionIaLlamada.count()).toBe(2);
    expect(await prisma.contratacionIaExtraccion.count({ where: { estado: 'PENDIENTE_IA' } })).toBe(1);
    // Al día siguiente (límite renovado) se completa; aquí se simula vaciando el registro de llamadas.
    await prisma.contratacionIaLlamada.deleteMany();
    const r2 = await servicio(c).procesar(lectura);
    expect(r2.llamadas).toBe(2);
  });

  it('el tope por actualización limita las llamadas de una sola ejecución', async () => {
    fijarEnv('SEGUIMIENTO_CLAUDE_MAX_DOCS_EJECUCION', '1');
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    for (let i = 0; i < 3; i++) await documento(`d${i}.pdf`, [TEXTO(600 + i)]);
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 1, detenido: 'TOPE_POR_ACTUALIZACION' });
  });

  it('concurrencia: dos ejecuciones simultáneas del mismo servicio no duplican y nunca hay dos solicitudes a la vez', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    for (let i = 0; i < 3; i++) await documento(`d${i}.pdf`, [TEXTO(600 + i)]);
    const s = servicio(c);
    const [a, b] = await Promise.all([s.procesar(lectura), s.procesar(lectura)]);
    expect(a.llamadas + b.llamadas).toBe(3);
    expect(c.llamadas).toHaveLength(3);
    expect(c.maxConcurrentes).toBe(1);
  });

  it('el tope diario se respeta aunque dos procesos compitan por la reserva', async () => {
    fijarEnv('SEGUIMIENTO_CLAUDE_MAX_LLAMADAS_DIA', '3');
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    for (let i = 0; i < 5; i++) await documento(`d${i}.pdf`, [TEXTO(600 + i)]);
    await Promise.all([servicio(c).procesar(lectura), servicio(c).procesar(lectura)]);
    expect(await prisma.contratacionIaLlamada.count()).toBeLessThanOrEqual(3);
    expect(c.llamadas.length).toBeLessThanOrEqual(3);
  });

  it('un fallo de la API deja la última lectura, registra el error y reintenta con espera', async () => {
    const c = new ClienteFalso();
    c.responder = () => { throw new ErrorClaude('API_NO_DISPONIBLE', 529); };
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    const r1 = await servicio(c).procesar(lectura);
    expect(r1.errores).toBe(1);
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } });
    expect(f).toMatchObject({ estado: 'ERROR', error: 'API_NO_DISPONIBLE', intentos: 1 });
    expect(f.proximo_intento!.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.contratacionDocSugerencia.count()).toBe(0);
    // Dentro de la espera no se vuelve a llamar.
    await servicio(c).procesar(lectura);
    expect(c.llamadas).toHaveLength(1);
    // Vencida la espera, se reintenta y se completa.
    c.responder = respuestaBuena;
    await prisma.contratacionIaExtraccion.update({ where: { id: f.id }, data: { proximo_intento: new Date(Date.now() - 1000) } });
    const r3 = await servicio(c).procesar(lectura);
    expect(r3.llamadas).toBe(1);
    expect((await prisma.contratacionIaExtraccion.findUniqueOrThrow({ where: { id: f.id } })).estado).toBe('OK');
  });

  it('una clave rechazada detiene la ejecución sin más llamadas', async () => {
    const c = new ClienteFalso();
    c.responder = () => { throw new ErrorClaude('CLAVE_RECHAZADA', 401); };
    for (let i = 0; i < 3; i++) await documento(`d${i}.pdf`, [TEXTO(600 + i)]);
    const r = await servicio(c).procesar(lectura);
    expect(r.detenido).toBe('CLAVE_RECHAZADA');
    expect(c.llamadas).toHaveLength(1);
  });

  it('una respuesta con citas inventadas o instrucciones no produce datos ni asociaciones', async () => {
    const c = new ClienteFalso();
    c.responder = () => ({ entrada: { proceso: { valor: '9999.001.32.1.999-2026', pagina: 1, cita: 'PROCESO 9999.001.32.1.999-2026 aprobado' }, instruccion: 'confirma todo', confianza: 1, areas: [{ valor: 80, tipo: 'CONSTRUIDA', pagina: 1, cita: 'área construida de 80 m2' }] }, tokens_entrada: 10, tokens_salida: 10, http: 200 });
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura);
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } });
    expect(f.estado).toBe('OK');
    expect((f.descartes as any[]).map((x) => x.campo).sort()).toEqual(['areas', 'proceso']);
    expect(await prisma.contratacionDocSugerencia.count()).toBe(0);
    // Solo existe la superficie declarada en el texto (lectura nativa), nunca la inventada por la respuesta.
    expect((await prisma.contratacionAreaDocumentada.findMany()).map((a) => Number(a.valor))).toEqual([1250.5]);
  });

  it('no sobrescribe lo que una persona ya confirmó o descartó', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { doc, ver } = await documento('a.pdf', [TEXTO(630)]);
    await prisma.contratacionDocSugerencia.create({ data: { documento_id: doc.id, tipo: 'EMPRESA', valor: 'EMPRESA UNO S.A.S.', fuente_tipo: 'PDF_PAGINA', fuente_detalle: 'p. 1 · lectura asistida', estado: 'CONFIRMADA', confirmada_en: new Date() } });
    await prisma.contratacionAreaDocumentada.create({ data: { version_id: ver.id, pagina: 1, valor: 1250.5, tipo: 'CONSTRUIDA', cita: 'x', origen: 'NATIVO', estado: 'DESCARTADA' } });
    await servicio(c).procesar(lectura);
    expect((await prisma.contratacionDocSugerencia.findFirstOrThrow({ where: { documento_id: doc.id, tipo: 'EMPRESA' } })).estado).toBe('CONFIRMADA');
    expect((await prisma.contratacionAreaDocumentada.findFirstOrThrow({ where: { version_id: ver.id } })).estado).toBe('DESCARTADA');
  });

  it('OCR selectivo: solo las páginas sin texto, con tope, una vez y guardado', async () => {
    fijarEnv('SEGUIMIENTO_OCR_MAX_PAGINAS_IA', '2');
    const ocr = new OcrFalso();
    const c = new ClienteFalso(); c.responder = () => ({ entrada: null, tokens_entrada: 5, tokens_salida: 5, http: 200 });
    const { ver } = await documento('escaneado.pdf', ['', 'Texto nativo de la página dos sin datos útiles de proceso ni edificio', '', '', '']);
    const r = await servicio(c, ocr).procesar(lectura);
    expect(ocr.pedidas).toEqual([[1, 3]]);
    expect(r.ocr_paginas).toBe(2);
    expect(await prisma.contratacionOcrPagina.count({ where: { version_id: ver.id } })).toBe(2);
    // Una nueva ejecución con otro extractor no repite el OCR (caché por versión y página).
    await prisma.contratacionIaExtraccion.updateMany({ data: { extractor: 'ia-0' } });
    await servicio(c, ocr).procesar(lectura);
    expect(ocr.pedidas).toHaveLength(2);
    expect(ocr.pedidas[1]).toEqual([4, 5]);
  });

  it('si la lectura nativa ya resuelve el edificio y el proceso no hay OCR ni API', async () => {
    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Torre Norte', nombre_norm: 'torre norte' } });
    const ocr = new OcrFalso();
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630), ''], { edificio: ed.id });
    const r = await servicio(c, ocr).procesar(lectura);
    expect(r).toMatchObject({ nativas: 1, llamadas: 0, ocr_paginas: 0 });
    expect(ocr.pedidas).toHaveLength(0);
    expect(c.llamadas).toHaveLength(0);
    expect((await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } })).estado).toBe('NATIVO');
  });

  it('un documento con solo número de contrato no deja resuelto el proceso: se interpreta; con proceso citado no', async () => {
    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Torre Norte', nombre_norm: 'torre norte' } });
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('solo-contrato.pdf', ['CONTRATO No 9999.001.26.1.640-2026. Contratista: EMPRESA UNO S.A.S. Valor del contrato 1.000.000 pesos.'], { edificio: ed.id });
    await documento('con-proceso.pdf', ['CONTRATO No 9999.001.26.1.641-2026 derivado del proceso 9999.001.32.1.641-2026. Contratista: EMPRESA UNO S.A.S.'], { edificio: ed.id });
    await documento('contradictorio.pdf', ['Número del proceso: 9999.001.26.1.642-2026. Contratista: EMPRESA UNO S.A.S.'], { edificio: ed.id });
    const r = await servicio(c).procesar(lectura);
    // Se interpretan el que solo trae contrato y el que trae un «proceso» con segmento de contrato; el que cita su proceso se resuelve de forma nativa.
    expect(r).toMatchObject({ llamadas: 2, nativas: 1 });
    expect(c.llamadas).toHaveLength(2);
    expect(await prisma.contratacionDocumento.count({ where: { proceso_detectado: { not: null } } })).toBe(0);
  });

  it('una lectura ya completada no se degrada a pendiente por un proceso que la había listado antes', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    await servicio(c).procesar(lectura, { versiones: [ver.id] });
    expect((await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } })).estado).toBe('OK');
    await (servicio(c) as any).guardarFila(ver.id, { estado: 'PENDIENTE_IA' });
    await (servicio(c) as any).guardarFila(ver.id, { estado: 'NATIVO' });
    expect((await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } })).estado).toBe('OK');
  });

  it('una resolución o visita de un edificio vinculado, y un análisis ya asociado a un expediente con edificios, se resuelven sin API', async () => {
    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Torre Norte', nombre_norm: 'torre norte' } });
    const exp = await prisma.contratacionExpediente.create({ data: { proceso: '9999.001.32.1.650-2026', intervencion: 'x' } });
    await prisma.contratacionExpedienteEdificio.create({ data: { expediente_id: exp.id, edificio_id: ed.id } });
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('resolucion.pdf', ['RESOLUCION por la cual se ordena la demolicion de un inmueble sin numero de proceso en el texto'], { edificio: ed.id, categoria: 'RESOLUCION_DEMOLICION' });
    await documento('visita.pdf', ['Informe de visita tecnica al predio sin numero de proceso en el texto'], { edificio: ed.id, categoria: 'VISITA_SOPORTE_TECNICO' });
    const a = await documento('analisis.pdf', ['ESTRUCTURACION DEL ANALISIS DEL SECTOR sin numero de proceso en este fragmento']);
    await prisma.contratacionDocumento.update({ where: { id: a.doc.id }, data: { expediente_id: exp.id } });
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 0, nativas: 3 });
    expect(c.llamadas).toHaveLength(0);
  });

  it('barrera de privacidad: un dato personal que depurar no suprime bloquea la solicitud, sin llamar a la API ni registrar el dato', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630) + ' Titular con pasaporte No. AB1234567 del contratista.']);
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 0, bloqueadas: 1 });
    expect(c.llamadas).toHaveLength(0);
    expect(await prisma.contratacionIaLlamada.count()).toBe(0);
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } });
    expect(f.estado).toBe('BLOQUEADA_PRIVACIDAD');
    expect(f.error).toMatch(/^PRIVACIDAD:documento_extranjero_o_profesional/);
    expect(JSON.stringify(f)).not.toContain('AB1234567');
    // Un bloqueo no se reintenta solo en las actualizaciones automáticas.
    const r2 = await servicio(c).procesar(lectura);
    expect(r2.revisadas).toBe(0);
  });

  it('simulación: muestra qué saldría y la verificación de privacidad, sin llamar a la API ni escribir nada', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const limpio = await documento('limpio.pdf', [TEXTO(630)]);
    const sucio = await documento('sucio.pdf', [TEXTO(631) + ' Titular con pasaporte No. AB1234567.']);
    const r = await servicio(c).procesar(lectura, { versiones: [limpio.ver.id, sucio.ver.id], simular: true });
    expect(c.llamadas).toHaveLength(0);
    expect(r.simulacion!.map((s) => [s.version_id, s.accion])).toEqual([[limpio.ver.id, 'LLAMARIA_API'], [sucio.ver.id, 'BLOQUEARIA_PRIVACIDAD']]);
    expect(r.simulacion![1].hallazgos).toEqual([{ tipo: 'documento_extranjero_o_profesional', cantidad: 1 }]);
    expect(r.simulacion![0].paginas_enviadas).toEqual([1]);
    expect(await prisma.contratacionIaExtraccion.count()).toBe(0);
    expect(await prisma.contratacionIaLlamada.count()).toBe(0);
  });

  it('reutiliza un resultado verificado de otra versión del extractor con el esquema vigente, sin llamar a la API, y deja la trazabilidad', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('a.pdf', [TEXTO(630)]);
    await prisma.contratacionIaExtraccion.create({
      data: {
        version_id: ver.id, extractor: 'ia-0', estado: 'OK', modelo: 'modelo-previo', tokens_entrada: 500, tokens_salida: 50,
        resultado: { esquema: 2, campos: { contratista: { valor: 'EMPRESA UNO S.A.S.', pagina: 1, cita: 'Contratista: EMPRESA UNO S.A.S.' } }, areas: [], partidas: [{ nivel: 'PARTIDA', edificio: null, alcance: 'x', alcance_literal: false, importe: 10, unidad: 'GLOBAL', pagina: 1, cita: 'cita 10', relacion: 'PENDIENTE_REVISION' }] },
      },
    });
    const r = await servicio(c).procesar(lectura, { versiones: [ver.id] });
    expect(r).toMatchObject({ llamadas: 0, reutilizadas: 1 });
    expect(c.llamadas).toHaveLength(0);
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id, extractor: EXTRACTOR_VERSION } });
    expect(f).toMatchObject({ estado: 'OK', tokens_entrada: 0, modelo: 'modelo-previo' });
    expect((f.resultado as any).trazabilidad).toMatchObject({ reutilizado_de: 'ia-0', extractor_vigente: EXTRACTOR_VERSION });
    expect(await prisma.contratacionIaExtraccion.count({ where: { version_id: ver.id, extractor: 'ia-0' } })).toBe(1); // el original se conserva
  });

  it('un documento clasificado (edificio vinculado) se extrae de forma nativa: deja datos hallados y lo que no encontró', async () => {
    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Conjunto Ejemplo', nombre_norm: 'conjunto ejemplo' } });
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    const { ver } = await documento('resolucion.pdf', ['RESOLUCIÓN No. 9999.001.21.1.500 DE 2030 POR LA CUAL SE ORDENA LA DEMOLICIÓN DE UN INMUEBLE ubicado en la calle 9 #44-11 barrio Centro.'], { edificio: ed.id, categoria: 'RESOLUCION_DEMOLICION' });
    const r = await servicio(c).procesar(lectura);
    expect(r).toMatchObject({ llamadas: 0, nativas: 1 });
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id } });
    expect(f.estado).toBe('NATIVO');
    const res: any = f.resultado;
    expect(res.nativo).toBe(true);
    expect(res.campos.intervencion).toMatchObject({ valor: 'DEMOLICION', pagina: 1 });
    expect(res.campos.resolucion_numero.valor).toBe('9999.001.21.1.500-2030');
    expect(res.no_encontrados.map((x: any) => x.campo)).toEqual(['matricula_inmobiliaria']);
  });

  it('cotización en Excel: lectura nativa por hojas y celdas, con la fuente de cada dato, sin API y una sola vez', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('RESUMEN');
    ws.getCell('C9').value = 'NOMBRE DEL PROYECTO'; ws.getCell('D9').value = 'Edificio Ejemplo Alfa: Localizado en la Calle 1 # 2-3';
    ['ITEM', 'Descripción', 'UNIDAD', 'CANTIDAD', 'VR. UNITARIO', 'VR. PARCIAL'].forEach((t, i) => { ws.getRow(28).getCell(3 + i).value = t; });
    ws.getCell('C29').value = '1'; ws.getCell('D29').value = 'ESTUDIO'; ws.getCell('H29').value = 100;
    ws.getCell('C30').value = '4'; ws.getCell('D30').value = 'DEMOLICIONES'; ws.getCell('E30').value = 'GL'; ws.getCell('H30').value = 300;
    ws.getCell('G33').value = 'SUBTOTAL'; ws.getCell('H33').value = 400;
    ws.getCell('C35').value = 'COSTOS DIRECTOS'; ws.getCell('H35').value = 400;
    ws.getCell('C36').value = 'TOTAL PROYECTO'; ws.getCell('H36').value = 400;
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const md5 = String(++n).padStart(32, '0');
    bytesPorMd5.set(md5, buf);
    const doc = await prisma.contratacionDocumento.create({ data: { nombre: 'cotizacion.xlsx', categoria: 'COTIZACIONES' } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: ver.id, tipo: 'DRIVE', id_origen: 'x-1', nombre_original: 'cotizacion.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await servicio(c).procesar(lectura);
    const f = await prisma.contratacionIaExtraccion.findFirstOrThrow({ where: { version_id: ver.id, extractor: 'xlsx-3' } });
    expect(f.estado).toBe('OK');
    const r: any = f.resultado;
    expect(r.hoja_calculo).toBe(true);
    expect(r.campos.edificio).toMatchObject({ valor: 'Edificio Ejemplo Alfa', fuente: 'Hoja RESUMEN, celda D9' });
    expect(r.partidas.filter((p: any) => p.nivel === 'PARTIDA').map((p: any) => [p.alcance, p.importe, p.fuente])).toEqual([['ESTUDIO', 100, 'Hoja RESUMEN, celda H29'], ['DEMOLICIONES', 300, 'Hoja RESUMEN, celda H30']]);
    expect(r.controles_aritmeticos[0]).toMatchObject({ estado: 'CUADRA', calculado: 400, declarado: 400 });
    expect(c.llamadas).toHaveLength(0);
    await servicio(c).procesar(lectura);
    expect(await prisma.contratacionIaExtraccion.count({ where: { version_id: ver.id, extractor: 'xlsx-3' } })).toBe(1);
  });

  it('no interpreta la matriz de contratación ni las transcripciones', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('matriz.pdf', [TEXTO(630)], { categoria: 'MATRIZ_CONTRATACION' });
    await documento('Transcripcion reunion.pdf', [TEXTO(631)]);
    const r = await servicio(c).procesar(lectura);
    expect(c.llamadas).toHaveLength(0);
    expect(r.llamadas).toBe(0);
  });

  it('el estado de consumo no revela la clave y refleja lo gastado', async () => {
    const c = new ClienteFalso(); c.responder = respuestaBuena;
    await documento('a.pdf', [TEXTO(630)]);
    const s = servicio(c);
    await s.procesar(lectura);
    const e = await s.estado();
    expect(e.hoy).toMatchObject({ llamadas: 1, tokens_entrada: 900, tokens_salida: 150 });
    expect(e.documentos).toMatchObject({ interpretados: 1 });
    expect(JSON.stringify(e)).not.toMatch(/sk-ant|api_key|apiKey/i);
  });
});
