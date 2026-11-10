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
