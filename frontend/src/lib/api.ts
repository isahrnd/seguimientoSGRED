export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = "/api/monitoreo-contratacion";

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ruta, { credentials: "same-origin", cache: "no-store", ...init });
  if (r.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.assign(`/login?volver=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!r.ok) {
    let msg: unknown = r.statusText;
    try {
      msg = (await r.json())?.message ?? msg;
    } catch {
      /* sin cuerpo */
    }
    throw new ApiError(r.status, Array.isArray(msg) ? msg.join(" ") : String(msg));
  }
  return (await r.json()) as T;
}

const qs = (p?: Record<string, unknown>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p ?? {})) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  get: <T,>(ruta: string, p?: Record<string, unknown>) => pedir<T>(`${BASE}${ruta}${qs(p)}`),
  post: <T,>(ruta: string) => pedir<T>(`${BASE}${ruta}`, { method: "POST" }),
  yo: () => pedir<{ usuario: { id: number; nombre: string; correo: string }; autorizado: boolean }>("/api/auth/yo"),
  login: (correo: string, password: string) =>
    pedir<{ usuario: { id: number; nombre: string } }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, password }),
    }),
  logout: () => pedir<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  urlContenido: (versionId: number) => `${BASE}/documentos/${versionId}/contenido`,
};

export const esErrorDeAcceso = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 401);
