import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HttpException } from '@nestjs/common';
import { DriveHttpClient, DriveTransitorioError, vaciarCacheRaiz, verificarEnRaiz } from './contratacion-drive.client';
import { ContratacionDocumentosService } from './contratacion-documentos.service';

/** Una caída pasajera de Drive no debe presentarse como «archivo retirado» (410): es un 503 reintentable. */
describe('Drive: fallas transitorias frente a archivo retirado', () => {
  const fetchOriginal = global.fetch;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drv-'));
    fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify({ refresh_token: 'x' }));
    process.env.SEGUIMIENTO_DRIVE_TOKEN_FILE = path.join(dir, 't.json');
    process.env.SEGUIMIENTO_DRIVE_CLIENT_ID = 'id';
    process.env.SEGUIMIENTO_DRIVE_CLIENT_SECRET = 's';
    process.env.SEGUIMIENTO_DRIVE_ROOT_ID = 'RAIZFALSA1234';
    vaciarCacheRaiz();
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const respuesta = (status: number, cuerpo: unknown = {}) =>
    ({ status, ok: status >= 200 && status < 300, clone() { return this; }, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo, headers: new Headers(), body: null }) as any;
  const oauth = (url: string) => (url.includes('oauth2') ? respuesta(200, { access_token: 'tk', expires_in: 3000 }) : null);

  it('reintenta ante 403 por cuota y termina bien', async () => {
    let n = 0;
    global.fetch = (async (url: string) => oauth(url) ?? (++n < 3 ? respuesta(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }) : respuesta(200, { id: 'a', name: 'a.pdf', mimeType: 'application/pdf' }))) as any;
    expect((await new DriveHttpClient().obtener('a'))?.id).toBe('a');
    expect(n).toBe(3);
  });

  it('un 404 es «no existe» (null) y no se reintenta', async () => {
    let n = 0;
    global.fetch = (async (url: string) => oauth(url) ?? (n++, respuesta(404))) as any;
    expect(await new DriveHttpClient().obtener('a')).toBeNull();
    expect(n).toBe(1);
  });

  it('errores de red repetidos lanzan una falla transitoria, no null', async () => {
    global.fetch = (async (url: string) => { const o = oauth(url); if (o) return o; throw new Error('ECONNRESET'); }) as any;
    await expect(new DriveHttpClient().obtener('a')).rejects.toBeInstanceOf(DriveTransitorioError);
  });

  it('verificarEnRaiz guarda en caché el resultado positivo y evita consultas repetidas', async () => {
    let n = 0;
    const cli: any = { obtener: async () => { n++; return { id: 'a', name: 'a', mimeType: 'application/pdf', parents: ['RAIZFALSA1234'] }; } };
    await verificarEnRaiz(cli, 'a', 'RAIZFALSA1234', 60_000);
    await verificarEnRaiz(cli, 'a', 'RAIZFALSA1234', 60_000);
    expect(n).toBe(1);
  });

  const servicio = (drive: any) => {
    const prisma: any = {
      contratacionDocumentoVersion: {
        findUnique: async () => ({ id: 1, numero: 1, md5: 'm', documento: { nombre: 'x.pdf' }, origenes: [{ tipo: 'DRIVE', estado: 'ACTIVO', mime: 'application/pdf', id_origen: 'a' }] }),
      },
    };
    return new ContratacionDocumentosService(prisma, drive);
  };
  const res: any = { setHeader: () => undefined, status: () => res, end: () => undefined, on: () => undefined };

  it('si Drive falla de forma transitoria responde 503, no 410', async () => {
    const drive: any = { configurado: () => true, obtener: async () => { throw new DriveTransitorioError('Drive no respondió'); } };
    const e: HttpException = await servicio(drive).servir(1, undefined, res).catch((x) => x);
    expect(e.getStatus()).toBe(503);
  });

  it('si el archivo ya no está en la raíz autorizada responde 410', async () => {
    const drive: any = { configurado: () => true, obtener: async () => null };
    const e: HttpException = await servicio(drive).servir(1, undefined, res).catch((x) => x);
    expect(e.getStatus()).toBe(410);
  });
});
