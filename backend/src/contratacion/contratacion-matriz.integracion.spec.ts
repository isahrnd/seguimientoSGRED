/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local) y datos ficticios:
 * lectura de la matriz de contratación en Excel → vínculo con expedientes, ficha del 819, adiciones, versiones e idempotencia.
 */
import { PrismaClient } from '@prisma/client';
import { ContratacionMatrizService } from './contratacion-matriz.service';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;
jest.setTimeout(60000);

const ENC = ['Cantidad', 'Número de proceso', 'Modalidad', 'Número de contrato', 'Objeto', 'Valor total', 'Estado', 'Contratista', 'Link SECOP II'];
type Fila = [number, string, string, string, string, number | string, string, string, string | { text: string; hyperlink: string }];

async function xlsx(hojas: Record<string, Fila[]>, conEncabezado = true): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    if (conEncabezado) ws.addRow(ENC);
    for (const f of filas) ws.addRow(f);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const COMPRAS: Fila[] = [
  [1, '9999.001.32.1.515-2026', 'Contratación directa - Convenio de asociación', '9999.001.27.1.5-2026', 'Aunar esfuerzos para soporte logístico', 4050000000, 'Ejecución', 'Fundación X', 'x'],
  [2, '9999.001.32.1.905-2026', 'Contratación directa - Contrato de obra', '9999.001.26.1.905- 2026', 'Ejecutar actividades de repique, demolición y gestión integral del RCD', 123456789.12, 'Ejecución', 'EMPRESA UNO S.A.S.', { text: 'Contrato', hyperlink: 'https://community.secop.gov.co/view?id=1' }],
  [3, '9999.001.32.1.901 -2026', 'Contratación directa - Alquiler maquinaria amarilla', '9999.001.26.1.901-2026', 'Alquiler y operación de maquinaria', 555555555.5, 'Ejecución', 'O2 S.A.S.', 'Contrato'],
];
const ADICION: Fila[] = [[1, '9999.001.32.1.905-2026', 'Adición', '9999.001.26.1.905-2026', 'Adición al contrato', 1500000.5, 'Ejecución', 'EMPRESA UNO S.A.S.', 'Contrato']];

d('matriz de contratación (BD)', () => {
  let prisma: PrismaClient;
  let svc: ContratacionMatrizService;
  let n = 0;
  const bytes = new Map<string, Buffer>();

  async function documento(nombre: string, buf: Buffer, categoria = 'SIN_CATEGORIA') {
    const md5 = String(++n).padStart(32, '0');
    bytes.set(md5, buf);
    const doc = await prisma.contratacionDocumento.create({ data: { nombre, categoria } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: ver.id, tipo: 'DRIVE', id_origen: `drive-${n}`, nombre_original: nombre, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    return { doc, ver, md5 };
  }
  const leer = async (md5: string) => bytes.get(md5) ?? null;
  const conteos = async () => ({
    filas: await prisma.contratacionMatrizFila.count(),
    lecturas: await prisma.contratacionMatrizLectura.count(),
    expedientes: await prisma.contratacionExpediente.count(),
    contratos: await prisma.contratacionContrato.count(),
    valores: await prisma.contratacionValor.count(),
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] });
    svc = new ContratacionMatrizService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    bytes.clear();
    n = 0;
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_matriz_filas, tbl_contratacion_matriz_lecturas, tbl_contratacion_doc_origenes, tbl_contratacion_contratos, tbl_contratacion_valores, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_expedientes RESTART IDENTITY CASCADE');
  });

  async function escenario() {
    const e630 = await prisma.contratacionExpediente.create({ data: { proceso: '9999.001.32.1.905-2026', intervencion: 'Molino ficticio' } });
    const e819 = await prisma.contratacionExpediente.create({ data: { proceso: 'CONTRATO-9999.001.26.1.901-2026', numero_contrato: '9999.001.26.1.901-2026', proceso_verificado: false, tipo: 'OTRA', intervencion: 'Maquinaria' } });
    const m = await documento('matriz.xlsx', await xlsx({ COMPRAS, ADICION }));
    return { e630, e819, m };
  }

  it('lee COMPRAS y ADICION, vincula la fila 3 con su expediente y conserva centavos, celdas y originales', async () => {
    const { e630, m } = await escenario();
    const r = await svc.procesar(leer);
    expect(r).toMatchObject({ versiones: 1, filas: 4 });
    const f = await prisma.contratacionMatrizFila.findFirstOrThrow({ where: { version_id: m.ver.id, hoja: 'COMPRAS', fila: 3 } });
    expect(f.expediente_id).toBe(e630.id);
    expect(f.vinculo).toBe('PROCESO');
    expect(Number(f.valor)).toBe(123456789.12);
    expect(f.contrato_original).toBe('9999.001.26.1.905- 2026'); // el original se conserva tal cual
    expect(f.proceso_original).toBe('9999.001.32.1.905-2026');
    expect(f.celdas).toMatchObject({ proceso_original: 'B3', contrato_original: 'D3', valor: 'F3', link: 'I3' });
    expect(f.secop_url).toBe('https://community.secop.gov.co/view?id=1');
    const lectura = await prisma.contratacionMatrizLectura.findUniqueOrThrow({ where: { version_id: m.ver.id } });
    expect(lectura).toMatchObject({ estado: 'MATRIZ', origen_id: 'drive-1', filas: 4 });
    expect((await prisma.contratacionExpediente.findUniqueOrThrow({ where: { id: e630.id } })).numero_contrato).toBe('9999.001.26.1.905-2026');
  });

  it('la matriz es fuente común: el documento no se asigna a un expediente y queda con su categoría', async () => {
    const { m } = await escenario();
    await svc.procesar(leer);
    const doc = await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: m.doc.id } });
    expect(doc).toMatchObject({ categoria: 'MATRIZ_CONTRATACION', estado_clasificacion: 'ASOCIADO', expediente_id: null });
  });

  it('la fila 4 completa el número de proceso de la ficha del 819 por su contrato', async () => {
    const { e819 } = await escenario();
    await svc.procesar(leer);
    const e = await prisma.contratacionExpediente.findUniqueOrThrow({ where: { id: e819.id } });
    expect(e).toMatchObject({ proceso: '9999.001.32.1.901-2026', proceso_verificado: true, numero_contrato: '9999.001.26.1.901-2026' });
  });

  it('convenios y adiciones sin expediente no crean contratos ni valores; la adición del 630 queda ligada a su contrato', async () => {
    const { e630 } = await escenario();
    const antes = await conteos();
    await svc.procesar(leer);
    const despues = await conteos();
    expect(despues.contratos).toBe(antes.contratos);
    expect(despues.valores).toBe(antes.valores);
    expect(despues.expedientes).toBe(antes.expedientes);
    const sinVinculo = await prisma.contratacionMatrizFila.findMany({ where: { expediente_id: null } });
    expect(sinVinculo.map((x) => x.alcance)).toEqual(['CONVENIO']);
    const adicion = await prisma.contratacionMatrizFila.findFirstOrThrow({ where: { tipo_hoja: 'ADICION' } });
    expect(adicion.expediente_id).toBe(e630.id);
  });

  it('reindexar dos veces deja las mismas filas, vínculos y totales', async () => {
    await escenario();
    await svc.procesar(leer);
    const a = await conteos();
    const vinculos = (await prisma.contratacionMatrizFila.findMany({ orderBy: { id: 'asc' }, select: { id: true, expediente_id: true } }));
    const r2 = await svc.procesar(leer);
    await svc.procesar(leer);
    expect(r2.versiones).toBe(0);
    expect(await conteos()).toEqual(a);
    expect(await prisma.contratacionMatrizFila.findMany({ orderBy: { id: 'asc' }, select: { id: true, expediente_id: true } })).toEqual(vinculos);
  });

  it('una versión nueva del archivo se lee de nuevo; las filas vigentes son las de la nueva versión y la anterior se conserva', async () => {
    const { e630, m } = await escenario();
    await svc.procesar(leer);
    const nueva = Buffer.from(await xlsx({ COMPRAS: COMPRAS.map((f) => (f[1].includes('905') ? [f[0], f[1], f[2], f[3], f[4], 300000000, ...f.slice(6)] as unknown as Fila : f)), ADICION }));
    const md5 = '9'.repeat(32);
    bytes.set(md5, nueva);
    await prisma.contratacionDocumentoVersion.updateMany({ where: { documento_id: m.doc.id }, data: { vigente: false } });
    const v2 = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: m.doc.id, numero: 2, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: v2.id, tipo: 'DRIVE', id_origen: 'drive-1', nombre_original: 'matriz.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', estado: 'ACTIVO' } });
    await prisma.contratacionDocumentoOrigen.updateMany({ where: { version_id: m.ver.id }, data: { estado: 'RETIRADO' } });
    await svc.procesar(leer);
    expect(await prisma.contratacionMatrizFila.count({ where: { version_id: m.ver.id } })).toBe(4); // historia conservada
    const vigentes = await prisma.contratacionMatrizFila.findMany({ where: { version: { vigente: true }, expediente_id: e630.id, tipo_hoja: 'COMPRAS' } });
    expect(vigentes.map((x) => Number(x.valor))).toEqual([300000000]);
  });

  it('un Excel sin los encabezados de la matriz se anota como no aplicable y no se vuelve a leer', async () => {
    const otro = await documento('otro.xlsx', await xlsx({ Hoja1: [[1, 'a', 'b', 'c', 'd', 1, 'e', 'f', 'g']] }, false));
    const r = await svc.procesar(leer);
    expect(r).toMatchObject({ versiones: 0, filas: 0 });
    expect((await prisma.contratacionMatrizLectura.findUniqueOrThrow({ where: { version_id: otro.ver.id } })).estado).toBe('NO_APLICA');
    expect((await svc.procesar(leer)).versiones).toBe(0);
  });

  it('una categoría confirmada por una persona no se reemplaza', async () => {
    const m = await documento('matriz.xlsx', await xlsx({ COMPRAS, ADICION }), 'COMPARATIVO_GENERAL');
    await svc.procesar(leer);
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: m.doc.id } })).categoria).toBe('COMPARATIVO_GENERAL');
  });

  it('no vincula con un proceso ambiguo', async () => {
    await prisma.contratacionExpediente.create({ data: { proceso: '9999.001.32.1.905-2026', intervencion: 'A' } });
    await prisma.contratacionExpediente.create({ data: { proceso: '9999.001.32.1.905 -2026', intervencion: 'B' } });
    const m = await documento('matriz.xlsx', await xlsx({ COMPRAS, ADICION }));
    await svc.procesar(leer);
    const f = await prisma.contratacionMatrizFila.findFirstOrThrow({ where: { version_id: m.ver.id, hoja: 'COMPRAS', fila: 3 } });
    expect(f.expediente_id).toBeNull();
  });
});
