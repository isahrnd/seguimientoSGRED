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

export interface DireccionPorVerificar {
  documento: string;
  version_id: number | null;
  /** Dirección tal como consta. */
  texto: string;
  /** De dónde sale: del contenido de una página del documento o solo del nombre del archivo (que no es evidencia). */
  origen: "PAGINA" | "NOMBRE_DE_ARCHIVO";
  pagina: number | null;
}

/**
 * Direcciones que constan en los documentos de una edificación y difieren de la registrada. Se muestran todas, aunque cambie la vía («Carrera» por
 * «Calle»): pueden ser accesos distintos a un mismo predio o un error, y eso lo decide una persona. Nunca cambia la dirección registrada ni los vínculos.
 */
export function direccionesPorVerificar(
  registrada: string | null | undefined,
  documentos: Array<{ nombre: string; version_id: number | null }>,
  lectura: Array<{ documento: string; version_id: number; campos: Array<{ campo: string; valor: string | number; pagina: number | null }> }> = [],
): DireccionPorVerificar[] {
  const base = extraerDirecciones(registrada);
  if (base.length === 0) return [];
  const claves = new Set(base.map((b) => b.clave));
  const salida: DireccionPorVerificar[] = [];
  const visto = new Set<string>();
  const agrega = (x: DireccionPorVerificar, clave: string) => {
    const k = `${x.documento}|${x.origen}|${clave}`;
    if (!visto.has(k)) { visto.add(k); salida.push(x); }
  };
  for (const l of lectura) {
    for (const c of l.campos) {
      if (c.campo !== "direccion") continue;
      for (const d of extraerDirecciones(String(c.valor))) if (!claves.has(d.clave)) agrega({ documento: l.documento, version_id: l.version_id, texto: d.texto, origen: "PAGINA", pagina: c.pagina }, d.clave);
    }
  }
  for (const doc of documentos) {
    for (const d of extraerDirecciones(doc.nombre)) if (!claves.has(d.clave)) agrega({ documento: doc.nombre, version_id: doc.version_id, texto: d.texto, origen: "NOMBRE_DE_ARCHIVO", pagina: null }, d.clave);
  }
  return salida;
}
