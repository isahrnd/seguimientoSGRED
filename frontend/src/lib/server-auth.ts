import { cookies } from "next/headers";

/** Valida la sesión EN EL SERVIDOR contra la API (revocable) antes de entregar cualquier pantalla privada. */
export async function sesionServidor(): Promise<{
  usuario: { id: number; nombre: string; correo: string };
  autorizado: boolean;
} | null | "sin-servicio"> {
  const jar = await cookies();
  const sid = jar.get("sgred_sid")?.value;
  if (!sid) return null;
  try {
    const r = await fetch(`${process.env.API_INTERNA || "http://127.0.0.1:4310"}/api/auth/yo`, {
      headers: { cookie: `sgred_sid=${sid}` },
      cache: "no-store",
    });
    if (r.status >= 500) return "sin-servicio";
    return r.ok ? await r.json() : null;
  } catch {
    return "sin-servicio";
  }
}
