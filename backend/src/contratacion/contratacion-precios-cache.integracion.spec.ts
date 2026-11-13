/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local) y datos ficticios:
 * la caché de la vista por edificio se reutiliza mientras los datos no cambian y se invalida al cambiar
 * documentos, asociaciones, extracciones, cotizaciones o edificios.
 */
import { PrismaClient } from '@prisma/client';
import { ContratacionPreciosEdificioService } from './contratacion-precios-edificio.service';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;

d('caché de la vista de precios por edificio (BD)', () => {
  let prisma: PrismaClient;
  let svc: ContratacionPreciosEdificioService;
  const md5 = 'a'.repeat(32);

  beforeAll(async () => { prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] }); });
  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_cotizaciones_edificio, tbl_contratacion_documento_edificios, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_edificios, tbl_contratacion_expedientes RESTART IDENTITY CASCADE');
    svc = new ContratacionPreciosEdificioService(prisma as any, {} as any, {} as any);
  });

  it('la firma no cambia sin cambios de datos y sí cambia al registrar un edificio, un documento, una asociación o una cotización', async () => {
    const f0 = await svc.firmaDeDatos();
    expect(await svc.firmaDeDatos()).toBe(f0);

    const ed = await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Ficticio Uno', nombre_norm: 'edificio ficticio uno' } });
    const f1 = await svc.firmaDeDatos();
    expect(f1).not.toBe(f0);

    const doc = await prisma.contratacionDocumento.create({ data: { nombre: 'oferta.pdf', categoria: 'COTIZACIONES' } });
    const ver = await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    const f2 = await svc.firmaDeDatos();
    expect(f2).not.toBe(f1);

    await prisma.contratacionDocumentoEdificio.create({ data: { documento_id: doc.id, edificio_id: ed.id } });
    const f3 = await svc.firmaDeDatos();
    expect(f3).not.toBe(f2);

    await prisma.contratacionCotizacionEdificio.create({
      data: { clave: 'clave-ficticia-1', version_id: ver.id, edificio_id: ed.id, proveedor: 'Proveedor Ficticio S.A.', concepto: 'Ítem', importe: 1000, base: 'COSTO_DIRECTO', pagina: 1, verificacion: 'VERIFICADO_EN_IMAGEN' } as any,
    });
    const f4 = await svc.firmaDeDatos();
    expect(f4).not.toBe(f3);

    // quitar la asociación (por ejemplo, al corregir un vínculo) también invalida
    await prisma.contratacionDocumentoEdificio.deleteMany();
    expect(await svc.firmaDeDatos()).not.toBe(f4);
  });

  it('la vista se calcula una sola vez mientras la firma sea la misma y se recalcula cuando cambian los datos', async () => {
    const calcular = jest.spyOn(svc as any, 'calcularVista').mockResolvedValue({ filas: [], fecha_corte: null, fuentes: [], revision: [], resumen: {}, generado_en: 'x' });
    await svc.vistaGeneral(); await svc.vistaGeneral(); await Promise.all([svc.vistaGeneral(), svc.vistaGeneral()]);
    expect(calcular).toHaveBeenCalledTimes(1);
    await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Ficticio Dos', nombre_norm: 'edificio ficticio dos' } });
    await svc.vistaGeneral();
    expect(calcular).toHaveBeenCalledTimes(2);
  });
});
