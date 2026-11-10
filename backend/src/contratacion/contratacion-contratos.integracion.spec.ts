/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local) y datos ficticios:
 * ingesta de contratos en PDF → asociación a expediente, revisión, ficha por número de contrato e idempotencia.
 */
import { PrismaClient } from '@prisma/client';
import { ContratacionContratosService } from './contratacion-contratos.service';
import { normalizar } from './contratacion-sugerencias';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;

const pagina1 = (numero: string, contratista: string, objeto: string, valor: string, extra = '') =>
  `CONTRA TO DE SERVICIOS CONTRA TO No . ${numero} CONTRA TANTE: DISTRITO CONTRA TISTA: ${contratista} OBJET O: “${objeto}” VALOR: ${valor}. ${extra}`;
const clausula = (v: string) => `CLÁUSULA TERCERA: VALOR. El valor del presente Contrato corresponde a la suma de ${v}`;
const firmas = 'EL CONTRATANTE: Firmado electrónicamente X EL CONTRATISTA: Firmado electrónicamente Y';

d('ingesta de contratos en PDF (BD)', () => {
  let prisma: PrismaClient;
  let svc: ContratacionContratosService;
  let n = 0;
  const paginasPorMd5 = new Map<string, string[]>();

  async function documento(nombre: string, paginas: string[], categoria = 'CONTRATACION_ACTAS') {
    const md5 = String(++n).padStart(32, '0');
    paginasPorMd5.set(md5, paginas);
    const doc = await prisma.contratacionDocumento.create({ data: { nombre, categoria } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: ver.id, tipo: 'DRIVE', id_origen: `f${n}`, nombre_original: nombre, mime: 'application/pdf' } });
    await prisma.contratacionDocIndice.create({ data: { version_id: ver.id, texto: normal(paginas[0]) } });
    return { doc, ver };
  }
  // Igual que el índice real: texto normalizado, sin signos de puntuación (así «objeto:» queda «objeto»).
  const normal = (s: string) => normalizar(s);
  const leer = async (_id: number, md5: string) => paginasPorMd5.get(md5) ?? null;

  async function expediente(proceso: string, interv: string, proveedor?: string) {
    const e = await prisma.contratacionExpediente.create({ data: { proceso, intervencion: interv } });
    if (proveedor) await prisma.contratacionOferta.create({ data: { expediente_id: e.id, clave: 'o1', proveedor, grupo_oferta: 'g1' } });
    return e;
  }
  const conteos = async () => ({
    contratos: await prisma.contratacionContrato.count(),
    expedientes: await prisma.contratacionExpediente.count(),
    lecturas: await prisma.contratacionDocContrato.count(),
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] });
    svc = new ContratacionContratosService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    paginasPorMd5.clear();
    n = 0;
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_doc_contrato, tbl_contratacion_doc_sugerencias, tbl_contratacion_doc_indice, tbl_contratacion_doc_origenes, tbl_contratacion_contratos, tbl_contratacion_ofertas, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_expedientes RESTART IDENTITY CASCADE');
  });

  it('asocia el contrato al expediente, guarda número de proceso y de contrato por separado y no toca la selección ni la ejecución', async () => {
    const e = await expediente('4163.001.32.1.900-2026', 'Alquiler de grúas para izaje de estructuras colapsadas', 'ACME GRUAS S.A.S.');
    const { doc } = await documento('Contrato ACME.pdf', [
      pagina1('4163.001.26.1.900 - 2026', 'JUAN PEREZ , C.C.# 1 R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR EL SERVICIO DE ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS', 'CIEN PESOS M/CTE ($100.000.000)'),
      clausula('CIEN PESOS M/CTE ($100.000.000)'), firmas,
    ]);
    const r = await svc.procesar(leer);
    expect(r).toMatchObject({ leidos: 1, asociados: 1, fichas: 0, revision: 0 });
    const ex = await prisma.contratacionExpediente.findUniqueOrThrow({ where: { id: e.id } });
    expect(ex.proceso).toBe('4163.001.32.1.900-2026');
    expect(ex.numero_contrato).toBe('4163.001.26.1.900-2026');
    const c = await prisma.contratacionContrato.findFirstOrThrow();
    expect(Number(c.valor)).toBe(100000000);
    expect(c.pagina).toBe(1);
    expect(c.oferta_id).toBeNull();
    expect(c.firma_estado).toBe('FIRMADO_ELECTRONICAMENTE');
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: doc.id } })).expediente_id).toBe(e.id);
    expect(await prisma.contratacionValor.count()).toBe(0); // nada de ejecución
  });

  it('una segunda lectura no duplica contratos ni expedientes', async () => {
    await expediente('4163.001.32.1.900-2026', 'Alquiler de grúas para izaje de estructuras colapsadas', 'ACME GRUAS S.A.S.');
    await documento('c.pdf', [pagina1('4163.001.26.1.900 - 2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS', '($100.000.000)'), clausula('($100.000.000)'), firmas]);
    await documento('d.pdf', [pagina1('4163.001.26.1.911 - 2026', 'R/L. BETA INGENIEROS SAS NIT 9', 'CONTRATAR MAQUINARIA PESADA Y APOYO DE OXICORTE', '($555.555.555,50)'), clausula('($555.555.555,50)'), firmas]);
    await svc.procesar(leer);
    const antes = await conteos();
    const r2 = await svc.procesar(leer);
    expect(r2).toMatchObject({ leidos: 0, asociados: 0, fichas: 0 });
    expect(await conteos()).toEqual(antes);
  });

  it('sin indicios crea una ficha por número de contrato con el proceso pendiente de verificar', async () => {
    await expediente('4163.001.32.1.900-2026', 'Alquiler de grúas', 'ACME GRUAS S.A.S.');
    await documento('CONTRATO.pdf', [pagina1('4163.001.26.1.911 - 2026', 'MATEO , C.C.# 1 R/L. BETA INGENIEROS SAS NIT 9', 'CONTRATAR EL SERVICIO DE MAQUINARIA PESADA Y APOYO DE OXICORTE', 'SETECIENTOS ($ 555.555.555,50)'), clausula('($ 555.555.555,50)'), firmas]);
    const r = await svc.procesar(leer);
    expect(r.fichas).toBe(1);
    const ficha = await prisma.contratacionExpediente.findFirstOrThrow({ where: { proceso_verificado: false } });
    expect(ficha.numero_contrato).toBe('4163.001.26.1.911-2026');
    expect(ficha.proceso).toBe('CONTRATO-4163.001.26.1.911-2026');
    expect(Number((await prisma.contratacionContrato.findFirstOrThrow({ where: { expediente_id: ficha.id } })).valor)).toBe(555555555.5);
  });

  it('ante coincidencia ambigua deja el documento en revisión y no registra el contrato', async () => {
    await expediente('4163.001.32.1.900-2026', 'Alquiler de grúas para izaje de estructuras colapsadas', 'ACME GRUAS S.A.S.');
    await expediente('4163.001.32.2.900-2026', 'Alquiler de grúas para izaje de estructuras colapsadas', 'ACME GRUAS S.A.S.');
    await documento('x.pdf', [pagina1('4163.001.26.1.900 - 2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS', '($100.000.000)'), clausula('($100.000.000)'), firmas]);
    const r = await svc.procesar(leer);
    expect(r.revision).toBe(1);
    expect(await prisma.contratacionContrato.count()).toBe(0);
    expect((await prisma.contratacionDocContrato.findFirstOrThrow()).estado).toBe('EN_REVISION');
  });

  it('clasifica por contenido un contrato con nombre ambiguo y no confunde disponibilidades con el valor', async () => {
    await expediente('4163.001.32.1.900-2026', 'Alquiler de grúas para izaje de estructuras colapsadas', 'ACME GRUAS S.A.S.');
    const { doc } = await documento('COMPLEMENTO..pdf', [
      pagina1('4163.001.26.1.900 - 2026', 'R/L. ACME GRUAS SAS NIT 9', 'CONTRATAR ALQUILER DE GRÚAS PARA IZAJE DE ESTRUCTURAS COLAPSADAS', '($100.000.000)', 'CDP No. 1 Valor: 4.864.000.000 COP'),
      clausula('($100.000.000)'), firmas,
    ], 'SIN_CATEGORIA');
    await svc.procesar(leer);
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: doc.id } })).categoria).toBe('CONTRATACION_ACTAS');
    expect(Number((await prisma.contratacionContrato.findFirstOrThrow()).valor)).toBe(100000000);
  });

  it('un documento cuya página 1 no es un contrato queda como no aplicable y no se relee', async () => {
    await documento('acta.pdf', ['INFORME: el contrato no tiene contratista asignado; objeto: pendiente de definir'], 'CONTRATACION_ACTAS');
    // Un documento sin ese contenido, aunque se llame «contrato» o esté en «actas», ni siquiera se lee.
    await documento('CONTRATO fantasma.pdf', ['Documento sin encabezado'], 'CONTRATACION_ACTAS');
    expect((await svc.procesar(leer)).leidos).toBe(0);
    expect(await prisma.contratacionDocContrato.count()).toBe(1);
    expect((await prisma.contratacionDocContrato.findFirstOrThrow()).estado).toBe('NO_APLICA');
    expect((await svc.procesar(leer)).leidos).toBe(0);
  });
});
