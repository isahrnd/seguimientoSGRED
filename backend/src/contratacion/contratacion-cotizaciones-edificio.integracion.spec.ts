/**
 * Pruebas con BD desechable (CONTRATACION_TEST_DATABASE_URL, solo local) y datos ficticios:
 * una cotización por edificio solo puede asociarse a un expediente con un número de proceso verificable.
 */
import { PrismaClient } from '@prisma/client';
import { ContratacionCotizacionesEdificioService } from './contratacion-cotizaciones-edificio.service';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;

d('cotizaciones por edificio: proceso verificable (BD)', () => {
  let prisma: PrismaClient;
  let svc: ContratacionCotizacionesEdificioService;
  const md5 = 'f'.repeat(32);
  const entrada = (extra: Record<string, unknown> = {}) => ({
    version: 1,
    cotizaciones_edificio: [{
      edificio: 'Edificio Ficticio Uno', documento: md5, proveedor: 'Proveedor Ficticio S.A.', concepto: 'Ítem 1', importe: 1000, base: 'COSTO_DIRECTO',
      pagina: 3, verificacion: 'VERIFICADO_EN_IMAGEN', ...extra,
    }],
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] });
    svc = new ContratacionCotizacionesEdificioService(prisma as any);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE tbl_contratacion_cotizaciones_edificio, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_edificios, tbl_contratacion_expedientes RESTART IDENTITY CASCADE');
    await prisma.contratacionEdificio.create({ data: { nombre: 'Edificio Ficticio Uno', nombre_norm: 'edificio ficticio uno' } });
    const doc = await prisma.contratacionDocumento.create({ data: { nombre: 'oferta.pdf', categoria: 'COTIZACIONES' } });
    await prisma.contratacionDocumentoVersion.create({ data: { documento_id: doc.id, numero: 1, md5 } });
    await prisma.contratacionExpediente.create({ data: { proceso: 'PROCESO-REAL-1', intervencion: 'Intervención ficticia' } });
  });

  it('rechaza un número de proceso inexistente y no crea ni asocia nada', async () => {
    const payload = entrada({ proceso: 'PROCESO-INEXISTENTE-9' });
    const v = await svc.previsualizar(payload);
    expect(v.valida).toBe(false);
    expect(v.errores.join(' ')).toMatch(/proceso no es verificable/);
    await expect(svc.aplicar(payload)).rejects.toThrow();
    expect(await prisma.contratacionCotizacionEdificio.count()).toBe(0);
  });

  it('sin número de proceso la cotización queda ligada solo al edificio', async () => {
    const r = await svc.aplicar(entrada());
    expect(r.aplicada).toBe(true);
    const fila = await prisma.contratacionCotizacionEdificio.findFirstOrThrow();
    expect(fila.expediente_id).toBeNull();
  });

  it('con un proceso existente se asocia al expediente', async () => {
    await svc.aplicar(entrada({ proceso: 'PROCESO-REAL-1' }));
    const fila = await prisma.contratacionCotizacionEdificio.findFirstOrThrow({ include: { expediente: true } });
    expect(fila.expediente?.proceso).toBe('PROCESO-REAL-1');
  });

  it('repetir la carga no duplica y la segunda aplicación no tiene efecto', async () => {
    await svc.aplicar(entrada());
    const r2 = await svc.aplicar(entrada());
    expect(r2.aplicada).toBe(false);
    expect(await prisma.contratacionCotizacionEdificio.count()).toBe(1);
  });

  it('rechaza un documento no indexado y un edificio inexistente', async () => {
    expect((await svc.previsualizar(entrada({ documento: 'a'.repeat(32) }))).errores.join(' ')).toMatch(/no indexado/);
    expect((await svc.previsualizar(entrada({ edificio: 'No existe' }))).errores.join(' ')).toMatch(/edificio no existe/);
  });
});
