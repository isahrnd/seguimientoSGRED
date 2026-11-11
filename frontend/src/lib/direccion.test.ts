import { describe, expect, it } from "vitest";
import { direccionesPorVerificar, extraerDirecciones } from "./direccion";

describe("direcciones por verificar", () => {
  it("muestra la dirección de la página y la del nombre del archivo, con documento y página", () => {
    const r = direccionesPorVerificar(
      "Carrera 10 # 5-20, comuna 1",
      [{ nombre: "23 (Hotel Cra 10 #60-15).pdf", version_id: 18 }],
      [{ documento: "23 (Hotel Cra 10 #60-15).pdf", version_id: 18, campos: [{ campo: "direccion", valor: "Carrera 10 # 60-157", pagina: 2 }] }],
    );
    expect(r).toEqual([
      { documento: "23 (Hotel Cra 10 #60-15).pdf", version_id: 18, texto: "Carrera 10 # 60-157", origen: "PAGINA", pagina: 2 },
      { documento: "23 (Hotel Cra 10 #60-15).pdf", version_id: 18, texto: "Cra 10 #60-15", origen: "NOMBRE_DE_ARCHIVO", pagina: null },
    ]);
  });

  it("no omite una discrepancia porque cambie «Carrera» por «Calle»", () => {
    const r = direccionesPorVerificar("Calle 9 # 44-59, barrio Ejemplo", [], [{ documento: "evaluacion.pdf", version_id: 7, campos: [{ campo: "direccion", valor: "Carrera 44 #44-37", pagina: 1 }] }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ texto: "Carrera 44 #44-37", pagina: 1, version_id: 7, origen: "PAGINA" });
  });

  it("no avisa si coincide (aunque varíe el espaciado o la abreviatura) o no hay dirección registrada", () => {
    expect(direccionesPorVerificar("Carrera 44 # 9-08", [{ nombre: "Hotel Cra 44 #9-08.pdf", version_id: 1 }], [{ documento: "r.pdf", version_id: 2, campos: [{ campo: "direccion", valor: "Carrera 44#9 - 08", pagina: 5 }] }])).toEqual([]);
    expect(direccionesPorVerificar(null, [{ nombre: "Cra 10 #60-15.pdf", version_id: 1 }], [])).toEqual([]);
  });

  it("no repite la misma dirección del mismo documento", () => {
    const campos = [{ campo: "direccion", valor: "Carrera 1 # 2-3", pagina: 1 }, { campo: "direccion", valor: "Carrera 1 # 2-3", pagina: 1 }];
    expect(direccionesPorVerificar("Carrera 9 # 9-9", [], [{ documento: "d.pdf", version_id: 1, campos }])).toHaveLength(1);
  });

  it("normaliza la nomenclatura colombiana", () => {
    expect(extraerDirecciones("Carrera 44#9 - 08")[0].clave).toBe(extraerDirecciones("Cra 44 # 9-08")[0].clave);
  });
});
