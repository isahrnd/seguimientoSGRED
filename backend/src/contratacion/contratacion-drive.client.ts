import * as fs from 'fs';
import { Readable } from 'stream';
import { driveRootId, driveTokenFile, ENV_CONTRATACION } from './contratacion.config';

export const CONTRATACION_DRIVE_CLIENT = 'CONTRATACION_DRIVE_CLIENT';

export const MIME_CARPETA = 'application/vnd.google-apps.folder';
export const MIME_ATAJO = 'application/vnd.google-apps.shortcut';

export interface DriveArchivo {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  trashed?: boolean;
}

export interface DriveDescarga {
  status: number;
  headers: Record<string, string>;
  stream: Readable;
}

/** Contrato de solo lectura. Nunca crea, modifica ni comparte nada. */
export interface DriveClient {
  configurado(): boolean;
  listarCarpeta(carpetaId: string, pageToken?: string): Promise<{ archivos: DriveArchivo[]; siguiente?: string }>;
  obtener(id: string): Promise<DriveArchivo | null>;
  descargar(id: string, rango?: string): Promise<DriveDescarga>;
}

/** Falla de Drive que puede resolverse sola (red, cuota, 5xx): no significa que el archivo se haya retirado. */
export class DriveTransitorioError extends Error {
  readonly transitorio = true;
}

const MOTIVOS_CUOTA = /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|backendError/i;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAMPOS = 'id,name,mimeType,md5Checksum,size,modifiedTime,parents,trashed';

export class DriveHttpClient implements DriveClient {
  private access?: { token: string; vence: number };

  configurado(): boolean {
    return !!driveRootId() && !!process.env[ENV_CONTRATACION.DRIVE_CLIENT_ID] && !!process.env[ENV_CONTRATACION.DRIVE_CLIENT_SECRET] && fs.existsSync(driveTokenFile());
  }

  private async token(): Promise<string> {
    if (this.access && this.access.vence > Date.now() + 30_000) return this.access.token;
    const refresh = JSON.parse(fs.readFileSync(driveTokenFile(), 'utf8')).refresh_token as string | undefined;
    if (!refresh) throw new Error('Drive sin vincular');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env[ENV_CONTRATACION.DRIVE_CLIENT_ID]!,
        client_secret: process.env[ENV_CONTRATACION.DRIVE_CLIENT_SECRET]!,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) throw new Error(`Drive: no se pudo renovar el acceso (${r.status})`);
    const j: any = await r.json();
    this.access = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3000) * 1000 };
    return this.access.token;
  }

  /** GET con hasta 3 intentos ante errores de red, 429, 5xx y 403 por cuota; los demás estados se devuelven tal cual. */
  private async get(url: string, extra: Record<string, string> = {}) {
    let ultimo = 'sin respuesta';
    for (let intento = 0; intento < 3; intento++) {
      if (intento > 0) await espera(300 * 3 ** (intento - 1));
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}`, ...extra } });
        if (r.status === 429 || r.status >= 500) { ultimo = String(r.status); continue; }
        if (r.status === 403) {
          const cuerpo = await r.clone().text().catch(() => '');
          if (MOTIVOS_CUOTA.test(cuerpo)) { ultimo = '403 por cuota'; continue; }
        }
        return r;
      } catch (e) {
        ultimo = (e as Error).message;
      }
    }
    throw new DriveTransitorioError(`Drive no respondió (${ultimo})`);
  }

  async listarCarpeta(carpetaId: string, pageToken?: string) {
    const q = `'${carpetaId.replace(/[^A-Za-z0-9_-]/g, '')}' in parents and trashed=false`;
    const p = new URLSearchParams({
      q, pageSize: '100', fields: `nextPageToken,files(${CAMPOS})`,
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const r = await this.get(`https://www.googleapis.com/drive/v3/files?${p}`);
    if (!r.ok) throw new Error(`Drive: error de conexión al listar (${r.status})`);
    const j: any = await r.json();
    return { archivos: (j.files ?? []) as DriveArchivo[], siguiente: j.nextPageToken as string | undefined };
  }

  async obtener(id: string): Promise<DriveArchivo | null> {
    const r = await this.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${CAMPOS}&supportsAllDrives=true`);
    if (r.status === 404 || r.status === 403) return null;
    if (!r.ok) throw new Error(`Drive: error de conexión (${r.status})`);
    return (await r.json()) as DriveArchivo;
  }

  async descargar(id: string, rango?: string): Promise<DriveDescarga> {
    const r = await this.get(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
      rango ? { Range: rango } : {},
    );
    if (!(r.status === 200 || r.status === 206) || !r.body) throw new Error(`Drive: no se pudo descargar (${r.status})`);
    const headers: Record<string, string> = {};
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) headers[h] = v;
    }
    return { status: r.status, headers, stream: Readable.fromWeb(r.body as any) };
  }
}

/**
 * Verifica que un archivo sigue dentro de la raíz autorizada, fuera de papelera,
 * que no es un atajo y que la identidad de lectura conserva acceso.
 */
const cacheRaiz = new Map<string, { vence: number; f: DriveArchivo }>();

/** Segundos que se reutiliza una verificación positiva (agrupa las lecturas por rango de un mismo visor). 0 la desactiva. */
export function cacheRaizMs(): number {
  const n = Number(process.env.SEGUIMIENTO_DRIVE_CACHE_SEGUNDOS ?? 10);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n * 1000 : 10_000;
}

export async function verificarEnRaiz(cli: DriveClient, id: string, raiz: string, ttlMs = cacheRaizMs()): Promise<DriveArchivo | null> {
  const clave = `${raiz}|${id}`;
  const hit = cacheRaiz.get(clave);
  if (hit && hit.vence > Date.now()) return hit.f;
  const f = await verificarEnRaizSinCache(cli, id, raiz);
  if (f && ttlMs > 0) cacheRaiz.set(clave, { vence: Date.now() + ttlMs, f });
  return f;
}

export function vaciarCacheRaiz() {
  cacheRaiz.clear();
}

async function verificarEnRaizSinCache(cli: DriveClient, id: string, raiz: string): Promise<DriveArchivo | null> {
  const f = await cli.obtener(id);
  if (!f || f.trashed || f.mimeType === MIME_ATAJO) return null;
  let actual: DriveArchivo = f;
  for (let i = 0; i < 12; i++) {
    const padres = actual.parents ?? [];
    if (padres.includes(raiz)) return f;
    if (padres.length === 0) return null;
    const sig = await cli.obtener(padres[0]);
    if (!sig || sig.trashed) return null;
    actual = sig;
  }
  return null;
}
