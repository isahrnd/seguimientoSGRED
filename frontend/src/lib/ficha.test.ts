import { describe, expect, it } from "vitest";
import { agruparItems, cantidadUnidad, etiquetaOferta, filasDesglose } from "./ficha";
import type { ItemOferta, OfertaEdificio } from "@/types/contratacion";

// Datos SINTÉTICOS.
const item = (actividad: string, subtotal: number | null, extra: Partial<ItemOferta> = {}): ItemOferta => ({ actividad, unidad: "GLOBAL", cantidad: 1, precio_unitario: null, subtotal, nivel: "PARTIDA", fuente: null, ...extra });
const oferta = (items: ItemOferta[], componentes: Partial<OfertaEdificio["componentes"]> = {}): OfertaEdificio => ({
  empresa: "EMPRESA UNO", documento: "x.pdf", version_id: 1, etapa: "COTIZACION", fecha: null, referencia: null, secuencia: null, nota_version: null, nivel: "COSTO_DIRECTO", items,
  componentes: { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null, ...componentes }, fuentes_componentes: {}, alcance: null, oferta_conjunta: null, relacion: "x", controles: [],
});

describe("desglose compacto", () => {
  it("cantidad y unidad en una sola celda", () => {
    expect(cantidadUnidad({ cantidad: 1, unidad: "GLOBAL" })).toBe("1 global");
    expect(cantidadUnidad({ cantidad: 1250.5, unidad: "M3" })).toBe("1.250,5 m3");
    expect(cantidadUnidad({ cantidad: null, unidad: null })).toBe("");
  });

  it("agrupa las subpartidas bajo su actividad por el código y suma al padre cuando no trae subtotal", () => {
    const filas = agruparItems([item("1 Demolición", null), item("1.1 Cargue", 30), item("1.2 Retiro", 70), item("2 Gestión de RCD", 50)]);
    expect(filas.map((f) => f.actividad)).toEqual(["1 Demolición", "2 Gestión de RCD"]);
    expect(filas[0].children?.map((f) => f.importe)).toEqual([30, 70]);
    expect(filas[0].importe).toBe(100);
  });

  it("sin código o sin padre la lista queda plana", () => {
    expect(agruparItems([item("Demolición total", 10), item("1.1 Suelta", 5)]).map((f) => f.actividad)).toEqual(["Demolición total", "1.1 Suelta"]);
  });

  it("administración, imprevistos, utilidad, IVA y total aparecen una sola vez; el costo directo no repite la suma de las actividades", () => {
    const filas = filasDesglose(oferta([item("A", 60), item("B", 40)], { costo_directo: 100, administracion: 15, imprevistos: 3, utilidad: 5, iva: 1, total: 124 }));
    expect(filas.map((f) => f.actividad)).toEqual(["A", "B", "Administración", "Imprevistos", "Utilidad", "IVA", "Total de la oferta"]);
    expect(filas[filas.length - 1].tipo).toBe("total");
    const distinto = filasDesglose(oferta([item("A", 60)], { costo_directo: 100 }));
    expect(distinto.map((f) => f.actividad)).toEqual(["A", "Costo directo"]);
  });

  it("etiqueta de oferta con referencia, fecha y orden por versión", () => {
    const f = (iso: string) => iso.split("-").reverse().join("/");
    expect(etiquetaOferta({ empresa: "EMPRESA UNO", referencia: "Cotización 136", fecha: "2026-09-19", secuencia: "POSTERIOR" }, f)).toBe("EMPRESA UNO · Cotización 136 · 19/09/2026 · posterior");
    expect(etiquetaOferta({ empresa: "EMPRESA UNO", referencia: null, fecha: null, secuencia: null }, f)).toBe("EMPRESA UNO");
  });
});
