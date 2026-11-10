import * as path from 'path';

/**
 * Configuración privada del módulo. Solo variables de entorno del servidor
 * (nunca NEXT_PUBLIC_*). Sin valor => la función devuelve null y el módulo
 * queda cerrado/inactivo para esa capacidad.
 */
export const ENV_CONTRATACION = {
  DOCS_DIR: 'SEGUIMIENTO_DOCS_DIR',
  USUARIO_ID: 'SEGUIMIENTO_USUARIO_ID',
  DRIVE_ROOT_ID: 'SEGUIMIENTO_DRIVE_ROOT_ID',
  DRIVE_TOKEN_FILE: 'SEGUIMIENTO_DRIVE_TOKEN_FILE',
  DRIVE_CLIENT_ID: 'SEGUIMIENTO_DRIVE_CLIENT_ID',
  DRIVE_CLIENT_SECRET: 'SEGUIMIENTO_DRIVE_CLIENT_SECRET',
  DRIVE_ABRIR_DIRECTO: 'SEGUIMIENTO_DRIVE_ABRIR_DIRECTO',
  SYNC_MINUTOS: 'SEGUIMIENTO_SYNC_MINUTOS',
} as const;

export function docsDir(): string {
  const v = process.env[ENV_CONTRATACION.DOCS_DIR]?.trim();
  return path.resolve(v || path.join(process.cwd(), 'privados-local', 'contrataciones'));
}

/** Id estable (tbl_usuarios.id) de la única cuenta autorizada. null => acceso cerrado. */
export function usuarioAutorizadoId(): number | null {
  const v = process.env[ENV_CONTRATACION.USUARIO_ID]?.trim();
  if (!v || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function driveRootId(): string | null {
  const v = process.env[ENV_CONTRATACION.DRIVE_ROOT_ID]?.trim();
  return v && /^[A-Za-z0-9_-]{10,}$/.test(v) ? v : null;
}

export function driveTokenFile(): string {
  const v = process.env[ENV_CONTRATACION.DRIVE_TOKEN_FILE]?.trim();
  return path.resolve(v || path.join(process.cwd(), 'privados-local', '.drive-token.json'));
}

export function driveAbrirDirecto(): boolean {
  return process.env[ENV_CONTRATACION.DRIVE_ABRIR_DIRECTO] === 'true';
}

/**
 * Intervalo (minutos) de la sincronización periódica de fuentes. Por defecto 30; 0 la desactiva.
 * Un valor distinto de 0 se limita a 5..1440 para no saturar la fuente ni dejarla desactualizada.
 */
export function sincronizacionMinutos(): number {
  const v = process.env[ENV_CONTRATACION.SYNC_MINUTOS]?.trim();
  if (v === undefined || v === '') return 30;
  if (!/^\d+$/.test(v)) return 30;
  const n = Number(v);
  return n === 0 ? 0 : Math.min(Math.max(n, 5), 1440);
}
