import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clasificar, esTranscripcion, extraerFecha, extraerProceso } from './contratacion-clasificador';
import { compararConReferenciaGlobal, compararLineas } from './contratacion-comparador';
import { validarImportacion } from './contratacion-importacion.validador';
import { parsearRango } from './contratacion-documentos.service';
import { escanearLocal, resolverDentro } from './contratacion-fuente-local';
import { ContratacionAccesoGuard, ContratacionAccesoService } from './contratacion-acceso.guard';

const MD5 = 'a'.repeat(32);
const F = { documento: MD5, pagina: 3 };

describe('clasificador', () => {
  it('detecta proceso, fecha y categoría sin casos particulares', () => {
    const t = 'ESTRUCTURACION DEL ANALISIS DEL SECTOR\nFecha: 05/03/2030\nNúmero del proceso: 1111.002.32.1.444 - 2030';
    const c = clasificar('cualquier nombre.pdf', t);
    expect(c).toMatchObject({ categoria: 'ANALISIS_SECTOR', proceso: '1111.002.32.1.444-2030', fecha: '2030-03-05' });
  });
  it('fecha imposible no se acepta', () => expect(extraerFecha('Fecha: 31/02/2030')).toBeNull());
  it('sin número de proceso queda sin proceso', () => expect(extraerProceso('nada')).toBeNull());
  it('excluye transcripciones', () => expect(esTranscripcion('Transcripción reunión.docx')).toBe(true));
});

describe('comparador de precios', () => {
  const base = { actividad: 'GESTION_INTEGRAL', unidad: 'M3', base_economica: 'TOTAL', grupo_comparacion: 'G' };
  it('calcula diferencia solo si todo coincide', () => {
    const r = compararLineas({ ...base, precio_unitario: 110 }, { ...base, precio_unitario: 100 });
    expect(r).toEqual({ comparable: true, diferencia_pct: 10 });
  });
  it('precio unitario de transporte de RCD no se compara con el valor global de una demolición', () => {
    const transp = { actividad: 'TRANSPORTE', unidad: 'M2', base_economica: 'COSTO_DIRECTO', precio_unitario: 27106 };
    const global = { actividad: 'DEMOLICION', unidad: 'GLOBAL', base_economica: 'TOTAL', precio_unitario: 500000000 };
    const r = compararLineas(transp, global);
    expect(r.comparable).toBe(false);
    expect(r.diferencia_pct).toBeUndefined();
    expect(r.motivo).toMatch(/global/i);
  });
  it('m² frente a m³ no es comparable', () => {
    const r = compararLineas({ ...base, unidad: 'M2', precio_unitario: 5 }, { ...base, precio_unitario: 5 });
    expect(r.comparable).toBe(false);
    expect(r.motivo).toMatch(/área no equivale a un volumen/);
  });
  it('costo directo frente a total no es comparable', () => {
    expect(compararLineas({ ...base, base_economica: 'COSTO_DIRECTO', precio_unitario: 5 }, { ...base, precio_unitario: 5 }).comparable).toBe(false);
  });
  it('referencia en cero o faltante no genera porcentaje', () => {
    expect(compararLineas({ ...base, precio_unitario: 5 }, { ...base, precio_unitario: 0 }).comparable).toBe(false);
    expect(compararLineas({ ...base, precio_unitario: null }, { ...base, precio_unitario: 3 }).comparable).toBe(false);
  });
  it('valor global de referencia nunca es comparable', () => expect(compararConReferenciaGlobal().comparable).toBe(false));
});

describe('validación de importación', () => {
  const ok = () => ({
    version: 1,
    expedientes: [{ proceso: '1111.002.32.1.444-2030', intervencion: 'X', ofertas: [{ clave: 'o', proveedor: 'P', grupo_oferta: 'g', fuente: F }], valores: [{ clave: 'v', tipo: 'COTIZADO', concepto: 'c', importe: 10, fuente: F }] }],
  });
  it('acepta una carga válida', () => expect(validarImportacion(ok()).errores).toEqual([]));
  it('rechaza una cotización registrada como valor contratado', () => {
    const p: any = ok(); p.expedientes[0].valores[0].tipo = 'CONTRATADO';
    const r = validarImportacion(p);
    expect(r.datos).toBeNull();
    expect(r.errores.join()).toMatch(/contratos/);
  });
  it('un contrato sin fuente documental es inválido', () => {
    const p: any = ok(); p.expedientes[0].contratos = [{ clave: 'k', tipo_acto: 'Contrato', valor: 5 }];
    expect(validarImportacion(p).errores.join()).toMatch(/fuente documental/);
  });
  it('rechaza cifra sin fuente y unidades inválidas', () => {
    const p: any = ok(); p.expedientes[0].lineas = [{ clave: 'l', actividad: 'DEMOLICION', descripcion: 'd', unidad: 'KG', base_economica: 'TOTAL' }];
    expect(validarImportacion(p).errores.length).toBeGreaterThanOrEqual(2);
  });
});

describe('peticiones parciales de PDF', () => {
  it('interpreta rangos válidos', () => {
    expect(parsearRango('bytes=0-9', 100)).toEqual({ inicio: 0, fin: 9 });
    expect(parsearRango('bytes=90-', 100)).toEqual({ inicio: 90, fin: 99 });
    expect(parsearRango('bytes=-10', 100)).toEqual({ inicio: 90, fin: 99 });
    expect(parsearRango(undefined, 100)).toBeNull();
  });
  it('rechaza rangos fuera del archivo o malformados', () => {
    expect(parsearRango('bytes=200-300', 100)).toBe('INVALIDO');
    expect(parsearRango('bytes=a-b', 100)).toBe('INVALIDO');
    expect(parsearRango('bytes=0-1,5-9', 100)).toBe('INVALIDO');
  });
});

describe('carpeta local protegida', () => {
  let base: string, fuera: string;
  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-base-'));
    fuera = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-fuera-'));
    fs.writeFileSync(path.join(base, 'a.pdf'), 'x');
    fs.writeFileSync(path.join(base, 'Transcripcion reunion.pdf'), 'x');
    fs.writeFileSync(path.join(fuera, 'secreto.pdf'), 'x');
    try { fs.symlinkSync(path.join(fuera, 'secreto.pdf'), path.join(base, 'enlace.pdf')); } catch { /* sin permisos de enlaces */ }
  });
  it('no permite salir de la carpeta (../ ni rutas absolutas)', async () => {
    expect(await resolverDentro(base, '../' + path.basename(fuera) + '/secreto.pdf')).toBeNull();
    expect(await resolverDentro(base, path.join(fuera, 'secreto.pdf'))).toBeNull();
    expect(await resolverDentro(base, 'a.pdf')).not.toBeNull();
  });
  it('un enlace simbólico hacia fuera no se sirve ni se indexa', async () => {
    if (fs.existsSync(path.join(base, 'enlace.pdf'))) expect(await resolverDentro(base, 'enlace.pdf')).toBeNull();
    const esc = await escanearLocal(base);
    expect(esc.archivos.map((a) => a.nombre)).toEqual(['a.pdf']);
    expect(esc.omitidos.transcripciones).toBe(1);
  });
});

describe('autorización exclusiva por identidad estable', () => {
  const guardar = process.env.SEGUIMIENTO_USUARIO_ID;
  afterEach(() => { if (guardar === undefined) delete process.env.SEGUIMIENTO_USUARIO_ID; else process.env.SEGUIMIENTO_USUARIO_ID = guardar; });
  const prisma = (activo = true) => ({ usuarios: { findUnique: jest.fn(async ({ where }) => (where.id === 7 ? { id: 7, estado: activo } : { id: where.id, estado: true })) } }) as any;
  const ctx = (user: any) => {
    const headers: Record<string, string> = {};
    return { headers, c: { switchToHttp: () => ({ getRequest: () => ({ user }), getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }) }) } as any };
  };

  it('configuración sin identidad: cerrado incluso para un administrador', async () => {
    delete process.env.SEGUIMIENTO_USUARIO_ID;
    const g = new ContratacionAccesoGuard(new ContratacionAccesoService(prisma()));
    await expect(g.canActivate(ctx({ id: 7, id_rol: 1 }).c)).rejects.toThrow('Acceso no autorizado');
  });
  it('permite solo el id configurado', async () => {
    process.env.SEGUIMIENTO_USUARIO_ID = '7';
    const g = new ContratacionAccesoGuard(new ContratacionAccesoService(prisma()));
    const { c, headers } = ctx({ id: 7 });
    await expect(g.canActivate(c)).resolves.toBe(true);
    expect(headers['Cache-Control']).toMatch(/no-store/);
    expect(headers['X-Robots-Tag']).toMatch(/noindex/);
  });
  it('otro funcionario, administrador genérico, id como texto o sin usuario: denegado', async () => {
    process.env.SEGUIMIENTO_USUARIO_ID = '7';
    const g = new ContratacionAccesoGuard(new ContratacionAccesoService(prisma()));
    for (const u of [{ id: 8 }, { id: 8, id_rol: 1, nombre: 'Administrador' }, { id: '7' }, { id: 7.5 }, {}, undefined, null, { email: 'ricardo@x', id: 9 }]) {
      await expect(g.canActivate(ctx(u).c)).rejects.toThrow('Acceso no autorizado');
    }
  });
  it('cuenta autorizada pero desactivada: denegado', async () => {
    process.env.SEGUIMIENTO_USUARIO_ID = '7';
    const g = new ContratacionAccesoGuard(new ContratacionAccesoService(prisma(false)));
    await expect(g.canActivate(ctx({ id: 7 }).c)).rejects.toThrow();
  });
  it('configuración no numérica deja el módulo cerrado', async () => {
    for (const v of ['ricardo', '7 ', '0', '-1', '7;8', '']) {
      process.env.SEGUIMIENTO_USUARIO_ID = v;
      const s = new ContratacionAccesoService(prisma());
      expect(await s.esAutorizado({ id: 7 })).toBe(v.trim() === '7');
    }
  });
});
