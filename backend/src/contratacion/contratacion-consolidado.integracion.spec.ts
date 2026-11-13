/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local) y datos ficticios:
 * lectura nativa del consolidado de seguimiento → filas con su celda, vínculo con edificios registrados (solo con evidencia), clasificación e idempotencia.
 */
import { PrismaClient } from '@prisma/client';
import { ContratacionConsolidadoService } from './contratacion-consolidado.service';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;
jest.setTimeout(60000);

const ENC = ['Nombre Edificación', 'Dirección', 'Estado', 'Avance demolición', 'Valor demolición', 'Metros cuadrados', 'Valor por metro cuadrado', 'Responsable'];

async function xlsx(filas: any[][]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(ENC);
  for (const f of filas) ws.addRow(f);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

d('consolidado de seguimiento (BD)', () => {
  let prisma: PrismaClient;
  let svc: ContratacionConsolidadoService;
  let n = 0;
  const bytes = new Map<string, Buffer>();
  const leer = async (md5: string) => bytes.get(md5) ?? null;

  async function documento(nombre: string, buf: Buffer) {
    const md5 = String(++n).padStart(32, '0');
    bytes.set(md5, buf);
    const doc = await prisma.contratacionDocumento.create({ data: { nombre, categoria: 'SIN_CATEGORIA' } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionDocumentoOrigen.create({ data: { version_id: ver.id, tipo: 'DRIVE', id_origen: `drive-${n}`, nombre_original: nombre, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    return { doc, ver, md5 };
  }

  beforeAll(async () => { prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] }); svc = new ContratacionConsolidadoService(prisma as any); });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    bytes.clear(); n = 0;
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_consolidado_filas, tbl_contratacion_consolidado_lecturas, tbl_contratacion_doc_origenes, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_edificios RESTART IDENTITY CASCADE');
  });

  const FILAS = [
    ['Edificio Alfa', 'Carrera 1 # 2-3', 'CONTRATADO', 'COMPLETADO', 1000000, 100, 10000, 'EMPRESA A'],
    ['Edificio Beta', 'Calle 4 # 5-6', 'POR CONTRATAR', 'COMPLETADO', { formula: '+F3*G3', result: 2500000 }, 250, 10000, 'EMPRESA B'],
    ['Edificio Sin Registro', 'Calle 9 # 9-9', 'POR CONTRATAR', 'COMPLETADO', 777, 7, 111, 'EMPRESA C'],
  ];

  it('lee las filas con su celda y fórmula, clasifica el documento, vincula solo lo inequívoco y no crea edificios', async () => {
    const alfa = await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Alfa', nombre_norm: 'edificio alfa', direccion: 'Carrera 1 # 2-3' } });
    await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Beta', nombre_norm: 'edificio beta' } });
    const { doc, ver } = await documento('SEGUIMIENTO_PRESENTACIÓN_11_11_26_.xlsx', await xlsx(FILAS));
    const r = await svc.procesar(leer);
    expect(r).toMatchObject({ versiones: 1, filas: 3, vinculadas: 2 });
    const filas = await prisma.contratacionConsolidadoFila.findMany({ orderBy: { fila: 'asc' } });
    expect(filas.map((f) => [f.nombre, Number(f.valor), f.edificio_id !== null, f.vinculo])).toEqual([
      ['Edificio Alfa', 1000000, true, 'NOMBRE_EXACTO'], ['Edificio Beta', 2500000, true, 'NOMBRE_EXACTO'], ['Edificio Sin Registro', 777, false, null],
    ]);
    expect(filas[0]).toMatchObject({ hoja: 'Hoja1', fila: 2, edificio_id: alfa.id, responsable: 'EMPRESA A', estado: 'CONTRATADO' });
    expect((filas[0].celdas as any).valor).toBe('E2');
    expect(filas[1].formula_valor).toBe('+F3*G3');
    expect(filas[0].fecha_corte!.toISOString().slice(0, 10)).toBe('2026-11-11');
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: doc.id } })).categoria).toBe('CONSOLIDADO_SEGUIMIENTO');
    expect(await prisma.contratacionEdificio.count()).toBe(2); // no se crean edificios
    expect(await prisma.contratacionDocumentoEdificio.count()).toBe(0); // ni vínculos documentales
    expect((await prisma.contratacionConsolidadoLectura.findUniqueOrThrow({ where: { version_id: ver.id } })).estado).toBe('CONSOLIDADO');
  });

  it('reindexar sin cambios no repite la lectura ni duplica filas', async () => {
    await documento('SEGUIMIENTO_PRESENTACIÓN_11_11_26_.xlsx', await xlsx(FILAS));
    await svc.procesar(leer);
    let lecturas = 0;
    const r2 = await svc.procesar(async (m) => { lecturas++; return leer(m); });
    expect(r2.versiones).toBe(0);
    expect(lecturas).toBe(0);
    expect(await prisma.contratacionConsolidadoFila.count()).toBe(3);
  });

  it('un Excel que no es un consolidado queda como NO_APLICA y no cambia su categoría', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); wb.addWorksheet('X').addRow(['Proceso', 'Valor']);
    const { doc, ver } = await documento('otro.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
    expect(await svc.procesar(leer)).toMatchObject({ versiones: 0, filas: 0 });
    expect((await prisma.contratacionConsolidadoLectura.findUniqueOrThrow({ where: { version_id: ver.id } })).estado).toBe('NO_APLICA');
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: doc.id } })).categoria).toBe('SIN_CATEGORIA');
  });

  it('el vínculo se reevalúa: un edificio registrado después queda vinculado; nunca se pisa una categoría confirmada', async () => {
    const { doc } = await documento('SEGUIMIENTO_PRESENTACIÓN_11_11_26_.xlsx', await xlsx(FILAS));
    await prisma.contratacionDocumento.update({ where: { id: doc.id }, data: { categoria: 'COMPARATIVO_GENERAL' } });
    await svc.procesar(leer);
    expect(await prisma.contratacionConsolidadoFila.count({ where: { edificio_id: { not: null } } })).toBe(0);
    expect((await prisma.contratacionDocumento.findUniqueOrThrow({ where: { id: doc.id } })).categoria).toBe('COMPARATIVO_GENERAL');
    await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Alfa', nombre_norm: 'edificio alfa' } });
    expect(await svc.vincular()).toBe(1);
  });
});
