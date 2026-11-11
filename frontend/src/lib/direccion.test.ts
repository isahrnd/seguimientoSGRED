import { describe, expect, it } from "vitest";
import { discrepanciasDireccion } from "./direccion";

describe("discrepancia documental de dirección", () => {
  it("detecta otra placa en la misma vía", () => {
    const r = discrepanciasDireccion("Carrera 10 # 5-20, comuna 1", ["23 (Hotel Cra 10 #60-15).pdf", "Inf visita.pdf"]);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("60-15");
  });
  it("no avisa si coincide o no hay dirección", () => {
    expect(discrepanciasDireccion("Carrera 10 # 5-20", ["Hotel Cra 10 #5-20.pdf"])).toEqual([]);
    expect(discrepanciasDireccion(null, ["Cra 10 #60-15.pdf"])).toEqual([]);
  });
});

import { discrepanciasDireccionDocumentos } from "./direccion";
describe("discrepancia de dirección: página original frente a nombre de archivo", () => {
  it("distingue la dirección leída en la página de la escrita en el nombre del archivo", () => {
    const r = discrepanciasDireccionDocumentos(
      "Carrera 10 # 5-20, comuna 1",
      ["23 (Hotel Cra 10 #60-15).pdf"],
      [{ documento: "23 (Hotel Cra 10 #60-15).pdf", campos: [{ campo: "direccion", valor: "Carrera 10 # 60-157", pagina: 2 }] }],
    );
    expect(r).toEqual([{ documento: "23 (Hotel Cra 10 #60-15).pdf", en_nombre: "Cra 10 #60-15", en_pagina: { texto: "Carrera 10 # 60-157", pagina: 2 } }]);
  });
  it("solo nombre de archivo, o solo página, se informan por separado; lo que coincide no se avisa", () => {
    expect(discrepanciasDireccionDocumentos("Carrera 10 # 5-20", ["Cra 10 #60-15.pdf"], [])).toEqual([{ documento: "Cra 10 #60-15.pdf", en_nombre: "Cra 10 #60-15" }]);
    expect(discrepanciasDireccionDocumentos("Carrera 10 # 5-20", ["a.pdf"], [{ documento: "a.pdf", campos: [{ campo: "direccion", valor: "Carrera 10#5 - 20", pagina: 1 }] }])).toEqual([]);
  });
});
