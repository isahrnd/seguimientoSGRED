import { claudeApiKey } from './contratacion.config';
import { SolicitudClaude } from './contratacion-ia';

/** Resultado de una solicitud: la entrada de la herramienta (lo que extrajo el modelo) y el consumo real informado por la API. */
export interface RespuestaClaude {
  entrada: unknown | null;
  tokens_entrada: number;
  tokens_salida: number;
  http: number;
}

export class ErrorClaude extends Error {
  constructor(public readonly codigo: string, public readonly http: number | null = null) {
    super(codigo);
  }
}

/** Contrato mínimo que usa el servicio; las pruebas lo sustituyen por respuestas simuladas. */
export interface ClienteClaude {
  disponible(): boolean;
  extraer(modelo: string, solicitud: SolicitudClaude): Promise<RespuestaClaude>;
}

export const CLIENTE_CLAUDE = Symbol('CLIENTE_CLAUDE');

const URL_MENSAJES = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 60_000;
const ESPERA_MAX_MS = 20_000;
const REINTENTOS = 2;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente HTTP directo (sin SDK). La clave se lee del entorno en cada llamada y solo va en la cabecera; no se registra,
 * y los errores se reducen a un código y el estado HTTP (nunca el cuerpo, que podría repetir texto del documento).
 */
export class ClienteClaudeHttp implements ClienteClaude {
  disponible(): boolean {
    return claudeApiKey() !== null;
  }

  async extraer(modelo: string, solicitud: SolicitudClaude): Promise<RespuestaClaude> {
    const clave = claudeApiKey();
    if (!clave) throw new ErrorClaude('SIN_CLAVE');
    let ultimo: ErrorClaude = new ErrorClaude('SIN_RESPUESTA');
    for (let intento = 0; intento <= REINTENTOS; intento++) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(URL_MENSAJES, {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelo, temperature: 0, ...solicitud }),
        });
        if (r.status === 429 || r.status === 529 || r.status >= 500) {
          ultimo = new ErrorClaude(r.status === 429 ? 'LIMITE_API' : 'API_NO_DISPONIBLE', r.status);
          const espera = Math.min(Number(r.headers.get('retry-after')) * 1000 || 1500 * 2 ** intento, ESPERA_MAX_MS);
          if (intento < REINTENTOS) { await dormir(espera); continue; }
          throw ultimo;
        }
        if (r.status === 401 || r.status === 403) throw new ErrorClaude('CLAVE_RECHAZADA', r.status);
        if (!r.ok) throw new ErrorClaude('SOLICITUD_RECHAZADA', r.status);
        const j: any = await r.json();
        const uso = j?.usage ?? {};
        const bloque = Array.isArray(j?.content) ? j.content.find((b: any) => b?.type === 'tool_use') : null;
        return { entrada: bloque?.input ?? null, tokens_entrada: Number(uso.input_tokens) || 0, tokens_salida: Number(uso.output_tokens) || 0, http: r.status };
      } catch (e: any) {
        if (e instanceof ErrorClaude) throw e;
        ultimo = new ErrorClaude(e?.name === 'AbortError' ? 'TIEMPO_AGOTADO' : 'RED');
        if (intento < REINTENTOS) { await dormir(1500 * 2 ** intento); continue; }
        throw ultimo;
      } finally {
        clearTimeout(t);
      }
    }
    throw ultimo;
  }
}
