import { describe, expect, it } from "vitest";
import { PENDIENTE, cop, fechaCorta, precioConUnidad } from "./format";

describe("formato del monitoreo de contratación", () => {
  it("un valor faltante nunca se muestra como cero", () => {
    expect(cop(null)).toBe(PENDIENTE);
    expect(precioConUnidad(null, "M3")).toBe(PENDIENTE);
  });
  it("el precio unitario lleva su unidad visible; la suma global no", () => {
    expect(precioConUnidad(1280, "M2")).toMatch(/\/ m²$/);
    expect(precioConUnidad(5000, "GLOBAL")).not.toMatch(/\//);
  });
  it("las fechas sin hora no se desfasan por zona horaria", () => {
    expect(fechaCorta("2030-03-05")).toBe("05/03/2030");
    expect(fechaCorta(null)).toBe(PENDIENTE);
  });
});

import { etiquetaCelda, parsearCelda, resumenFuente, urlHoja } from "./format";

describe("hojas y fuentes", () => {
  it("construye el enlace y la etiqueta de hoja y celda", () => {
    expect(etiquetaCelda("Datos", "B2")).toBe("Hoja Datos · celda B2");
    expect(etiquetaCelda("Datos", null)).toBeNull();
    expect(urlHoja(7, "Hoja 1", "C3")).toBe("/documentos/hoja/7?hoja=Hoja%201&celda=C3");
    expect(urlHoja(7)).toBe("/documentos/hoja/7");
  });
  it("interpreta referencias de celda", () => {
    expect(parsearCelda("B2")).toEqual({ fila: 2, columna: 2 });
    expect(parsearCelda("AA10")).toEqual({ fila: 10, columna: 27 });
    expect(parsearCelda("2B")).toBeNull();
  });
  it("distingue falla de conexión, carpeta vacía y sin configurar", () => {
    expect(resumenFuente("DRIVE", "ERROR").texto).toMatch(/No se pudo conectar con Drive/);
    expect(resumenFuente("DRIVE", "VACIA").texto).toBe("La carpeta aparece vacía.");
    expect(resumenFuente("DRIVE", "SIN_CONFIGURAR").tono).toBe("neutro");
    expect(resumenFuente("LOCAL", "CORRECTA").tono).toBe("ok");
  });
});

import { urlAbrirOriginal } from "./format";

describe("abrir originales", () => {
  it("elige hoja o visor según la extensión", () => {
    expect(urlAbrirOriginal("Cuadro.XLSX", 3)).toBe("/documentos/hoja/3");
    expect(urlAbrirOriginal("visita.pdf", 4)).toBe("/documentos/visor/4");
  });
});
