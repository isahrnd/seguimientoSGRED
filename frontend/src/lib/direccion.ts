const RE = /\b(carrera|cra|kr|calle|cl|avenida|av|diagonal|transversal)\.?\s*(\d+\s*[a-z]?)\s*(?:#|no\.?|n°|nro\.?)\s*(\d+\s*[a-z]?)\s*-\s*(\d+)/gi;
const TIPO: Record<string, string> = { carrera: "cra", cra: "cra", kr: "cra", calle: "cl", cl: "cl", avenida: "av", av: "av", diagonal: "dg", transversal: "tv" };

export interface DireccionNorm { clave: string; texto: string }

/** Extrae direcciones de nomenclatura colombiana («Carrera 44 # 9-08») de un texto, normalizadas para comparar. */
export function extraerDirecciones(texto: string | null | undefined): DireccionNorm[] {
  const out: DireccionNorm[] = [];
  for (const m of (texto ?? "").matchAll(RE)) {
    const n = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    out.push({ clave: `${TIPO[m[1].toLowerCase()]}${n(m[2])}#${n(m[3])}-${m[4]}`, texto: m[0].replace(/\s+/g, " ").trim() });
  }
  return out;
}

/** Direcciones citadas en nombres de documentos que difieren de la dirección registrada (misma vía, distinta placa). */
export function discrepanciasDireccion(registrada: string | null | undefined, nombres: string[]): string[] {
  const base = extraerDirecciones(registrada);
  if (base.length === 0) return [];
  const claves = new Set(base.map((b) => b.clave));
  const vias = new Set(base.map((b) => b.clave.split("#")[0]));
  const dif = new Set<string>();
  for (const nombre of nombres) {
    for (const d of extraerDirecciones(nombre)) {
      if (!claves.has(d.clave) && vias.has(d.clave.split("#")[0])) dif.add(`“${d.texto}” en ${nombre}`);
    }
  }
  return [...dif];
}
