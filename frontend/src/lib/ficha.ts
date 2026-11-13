import type { FuenteDato, ItemOferta, OfertaEdificio } from "@/types/contratacion";

/** Fila del desglose compacto: una actividad (con sus subpartidas anidadas) o un componente (AIU, IVA, total) que se muestra una sola vez. */
export interface FilaDesglose {
  key: string;
  tipo: "actividad" | "componente" | "total";
  actividad: string;
  cantidad: string;
  unitario: number | null;
  importe: number | null;
  fuente: FuenteDato | null;
  children?: FilaDesglose[];
}

export const cantidadUnidad = (i: Pick<ItemOferta, "cantidad" | "unidad">): string => {
  const unidad = i.unidad ? (i.unidad === "GLOBAL" ? "global" : i.unidad.toLowerCase()) : "";
  const cant = i.cantidad !== null ? i.cantidad.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "";
  return [cant, unidad].filter(Boolean).join(" ");
};

/** Código jerárquico al inicio de la actividad («1.2», «3.1.4»), si lo trae. */
const codigo = (t: string): string | null => /^\s*(\d+(?:\.\d+)*)[\s.)\-–]/.exec(t + " ")?.[1] ?? null;

/** Agrupa subpartidas bajo su actividad cuando el código lo indica («1.1» bajo «1»); si no, la lista queda plana. */
export function agruparItems(items: ItemOferta[]): FilaDesglose[] {
  const filas: FilaDesglose[] = items.map((i, n) => ({ key: `i${n}`, tipo: "actividad", actividad: i.actividad, cantidad: cantidadUnidad(i), unitario: i.precio_unitario, importe: i.subtotal, fuente: i.fuente }));
  const porCodigo = new Map<string, FilaDesglose>();
  filas.forEach((fila) => { const c = codigo(fila.actividad); if (c && !c.includes(".") && !porCodigo.has(c)) porCodigo.set(c, fila); });
  const salida: FilaDesglose[] = [];
  for (const fila of filas) {
    const c = codigo(fila.actividad);
    const padre = c && c.includes(".") ? porCodigo.get(c.split(".")[0]) : undefined;
    if (padre && padre !== fila) (padre.children ??= []).push(fila);
    else salida.push(fila);
  }
  for (const fila of salida) if (fila.children && fila.importe === null) fila.importe = Math.round(fila.children.reduce((a, h) => a + (h.importe ?? 0), 0) * 100) / 100;
  return salida;
}

/** Desglose de una oferta: actividades y, una sola vez, administración, imprevistos, utilidad, IVA y total. El costo directo solo se agrega si no repite la suma de las actividades. */
export function filasDesglose(o: OfertaEdificio): FilaDesglose[] {
  const filas = agruparItems(o.items);
  const suma = Math.round(o.items.reduce((a, i) => a + (i.subtotal ?? 0), 0) * 100) / 100;
  const c = o.componentes;
  const comp: Array<[string, number | null, string, "componente" | "total"]> = [
    ["Costo directo", c.costo_directo !== null && Math.abs(c.costo_directo - suma) < 0.5 ? null : c.costo_directo, "costo_directo", "componente"],
    ["Administración", c.administracion, "administracion", "componente"],
    ["Imprevistos", c.imprevistos, "imprevistos", "componente"],
    ["Utilidad", c.utilidad, "utilidad", "componente"],
    ["IVA", c.iva, "iva", "componente"],
    ["Total de la oferta", c.total, "total", "total"],
  ];
  for (const [etq, v, k, tipo] of comp) if (v !== null) filas.push({ key: `c-${k}`, tipo, actividad: etq, cantidad: "", unitario: null, importe: v, fuente: o.fuentes_componentes[k] ?? null });
  return filas;
}

export const etiquetaOferta = (o: { empresa: string; referencia: string | null; fecha: string | null; secuencia: "ANTERIOR" | "POSTERIOR" | null }, fecha: (iso: string) => string): string =>
  `${o.empresa}${o.referencia ? ` · ${o.referencia}` : ""}${o.fecha ? ` · ${fecha(o.fecha)}` : ""}${o.secuencia ? ` · ${o.secuencia === "ANTERIOR" ? "anterior" : "posterior"}` : ""}`;
