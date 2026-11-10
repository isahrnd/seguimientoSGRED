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

/**
 * Claude API (solo backend, nunca NEXT_PUBLIC_*). Sin clave, la lectura nativa de PDF/Excel y las reglas locales siguen funcionando;
 * solo se pausa la interpretación asistida y las tareas quedan pendientes de reintento.
 */
export const ENV_CLAUDE = {
  API_KEY: 'ANTHROPIC_API_KEY',
  MODELO: 'SEGUIMIENTO_CLAUDE_MODELO',
  MAX_LLAMADAS_DIA: 'SEGUIMIENTO_CLAUDE_MAX_LLAMADAS_DIA',
  MAX_TOKENS_ENTRADA: 'SEGUIMIENTO_CLAUDE_MAX_TOKENS_ENTRADA',
} as const;

export function claudeApiKey(): string | null {
  const v = process.env[ENV_CLAUDE.API_KEY]?.trim();
  return v && v.length >= 20 && !/\s/.test(v) ? v : null;
}

export function claudeModelo(): string {
  const v = process.env[ENV_CLAUDE.MODELO]?.trim();
  return v && /^[a-z0-9][a-z0-9.-]{2,80}$/i.test(v) ? v : 'claude-sonnet-5-5';
}

const entero = (clave: string, def: number, min: number, max: number): number => {
  const v = process.env[clave]?.trim();
  if (!v || !/^\d+$/.test(v)) return def;
  return Math.min(Math.max(Number(v), min), max);
};

/** Tope de llamadas por día (0 las desactiva) y de tokens de entrada por llamada: límite de consumo antes de cada solicitud. */
export const claudeMaxLlamadasDia = () => entero(ENV_CLAUDE.MAX_LLAMADAS_DIA, 50, 0, 2000);
export const claudeMaxTokensEntrada = () => entero(ENV_CLAUDE.MAX_TOKENS_ENTRADA, 12000, 500, 100000);

/** Estado sin revelar la clave: solo si hay una configurada. */
export function claudeConfigurado(): boolean {
  return claudeApiKey() !== null && claudeMaxLlamadasDia() > 0;
}
