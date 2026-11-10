const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 });

export const PENDIENTE = "Pendiente de soporte";

export function cop(v: number | null | undefined): string {
  return v === null || v === undefined ? PENDIENTE : COP.format(v);
}

export const UNIDAD_ETQ: Record<string, string> = { M3: "m³", M2: "m²", H_EQUIPO: "hora de equipo", VIAJE: "viaje", GLOBAL: "suma global", UND: "unidad" };
export const BASE_ETQ: Record<string, string> = { COSTO_DIRECTO: "Costo directo", AIU: "AIU", IMPUESTOS: "Impuestos", TOTAL: "Total según la fuente" };
export const ACTIVIDAD_ETQ: Record<string, string> = {
  DEMOLICION: "Demolición", REPIQUE: "Repique", CARGUE: "Cargue", RETIRO: "Retiro", TRANSPORTE: "Transporte",
  DISPOSICION_RCD: "Disposición de RCD", GESTION_INTEGRAL: "Servicio integral (demolición, cargue, transporte y gestión de RCD)", OTRO: "Otro componente",
};
export const ESTADO_ETQ: Record<string, string> = {
  PENDIENTE_SOPORTE: "Pendiente de soporte",
  ANALISIS_DEL_SECTOR: "Análisis del sector",
  CONTRATADO: "Contratado",
  EJECUCION_DOCUMENTADA: "Ejecución documentada",
};

/** Precio unitario con su unidad visible: "$1.000 / m³". Si es suma global no lleva unidad. */
export function precioConUnidad(precio: number | null, unidad: string): string {
  if (precio === null) return PENDIENTE;
  return unidad === "GLOBAL" ? COP.format(precio) : `${COP.format(precio)} / ${UNIDAD_ETQ[unidad] ?? unidad}`;
}

export function cantidadConUnidad(c: number | null, unidad: string): string {
  return c === null ? "—" : unidad === "GLOBAL" ? "—" : `${NUM.format(c)} ${UNIDAD_ETQ[unidad] ?? unidad}`;
}

/** Fechas "YYYY-MM-DD" sin desfase de zona horaria. */
export function fechaCorta(f: string | Date | null | undefined): string {
  if (!f) return PENDIENTE;
  const s = typeof f === "string" ? f : f.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && s.length === 10) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? PENDIENTE : d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

export const ESTADO_VALOR_ETQ: Record<string, string> = {
  SOPORTADO: "Soportado",
  CITADO_SIN_ACTA: "Citado; acta pendiente",
  PENDIENTE_SOPORTE: "Pendiente de soporte",
};

export const SELECCION_ETQ: Record<string, string> = {
  ADJUDICADA: "Seleccionada y adjudicada con acto de contratación",
  JUSTIFICADA_SIN_ACTO: "Justificación documentada; falta el acto de contratación",
  PENDIENTE_SOPORTE: "Pendiente de soporte",
};

/** "Hoja Datos · celda B2". */
export function etiquetaCelda(hoja: string | null | undefined, celda: string | null | undefined): string | null {
  return hoja && celda ? `Hoja ${hoja} · celda ${celda}` : null;
}

/** Enlace a la vista de hoja con hoja y celda resaltadas. */
export function urlHoja(versionId: number, hoja?: string | null, celda?: string | null): string {
  const base = `/documentos/hoja/${versionId}`;
  if (!hoja || !celda) return base;
  return `${base}?hoja=${encodeURIComponent(hoja)}&celda=${encodeURIComponent(celda)}`;
}

/** "B2" => { fila: 2, columna: 2 }; null si no es una referencia válida. */
export function parsearCelda(ref: string | null | undefined): { fila: number; columna: number } | null {
  const m = /^([A-Za-z]{1,3})([1-9][0-9]{0,6})$/.exec(ref ?? "");
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { fila: Number(m[2]), columna: col };
}

export type ResumenFuente = { tono: "ok" | "error" | "neutro"; texto: string };

/** Distingue una falla de conexión de una carpeta vacía y de una fuente sin configurar. */
export function resumenFuente(tipo: "LOCAL" | "DRIVE", estado: string): ResumenFuente {
  const nombre = tipo === "DRIVE" ? "Drive" : "la carpeta local";
  if (estado === "ERROR") return { tono: "error", texto: `No se pudo conectar con ${nombre}; se conservan los datos anteriores.` };
  if (estado === "VACIA") return { tono: "neutro", texto: "La carpeta aparece vacía." };
  if (estado === "SIN_CONFIGURAR") return { tono: "neutro", texto: "Sin configurar." };
  return { tono: "ok", texto: "Actualizada." };
}

/** Enlace para abrir el original: hoja de cálculo o visor de PDF según la extensión del nombre. */
export function urlAbrirOriginal(nombre: string, versionId: number): string {
  return /\.xlsx?$/i.test(nombre) ? urlHoja(versionId) : `/documentos/visor/${versionId}`;
}

export const REQUISITO_TONO: Record<string, "secondary" | "outline" | "destructive"> = {
  VERIFICADA: "secondary",
  NO_APLICA: "secondary",
  PENDIENTE_SOPORTE: "outline",
  POR_CONFIRMAR_ALCANCE: "outline",
  SIN_INTERVENCION: "outline",
};

/** Número de proceso y número de contrato son datos distintos; un proceso sin verificar se dice expresamente. */
export function etiquetaProceso(e: { proceso: string; numero_contrato?: string | null; proceso_verificado?: boolean }): string {
  if (e.proceso_verificado === false) return `Contrato ${e.numero_contrato ?? e.proceso.replace(/^CONTRATO-/, "")} · proceso pendiente de verificar`;
  return `Proceso ${e.proceso}${e.numero_contrato ? ` · Contrato ${e.numero_contrato}` : ""}`;
}
