import { describe, expect, it } from "vitest";
import { areaDocumentada, desglose, encabezadoM2, historial, porM2 } from "./precios-actividad";

const sop = (p: number) => ({ version_id: 1, documento_id: 1, documento: "doc.pdf", numero_version: 1, es_vigente: true, version_vigente_id: null, pagina: p, hoja: null, celda: null });
let n = 0;
const lin = (o: Record<string, unknown>) => ({
  id: ++n, clave: `l${n}`, oferta_clave: "o1", proveedor: "ACME", actividad: "OTRO", descripcion: "x", cantidad: null, unidad: "GLOBAL", precio_unitario: null, total: null,
  base_economica: "COSTO_DIRECTO", grupo_comparacion: null, derivado: false, estado_revision: "VERIFICADO", nota: null, soporte: sop(10), ...o,
});

// Estructura de un análisis por capítulos con área en m² (cifras ficticias).
const lineas = () => [
  lin({ clave: "l-cap1", descripcion: "Capítulo 1. Servicios", cantidad: 100.004, unidad: "M2", precio_unitario: 1000, total: 100004 }),
  lin({ clave: "l-cap2", descripcion: "Capítulo 2. Operativas", cantidad: 99.9, unidad: "M2", precio_unitario: 500, total: 49950 }),
  lin({ clave: "l-cap3", descripcion: "Capítulo 3. Demolición mecánica", actividad: "DEMOLICION", grupo_comparacion: "DEM_M2", cantidad: 100.001, unidad: "M2", precio_unitario: 200000, total: 20000200 }),
  lin({ clave: "l-31", descripcion: "3.1 Derribo controlado", actividad: "DEMOLICION", grupo_comparacion: "DEM_M2", cantidad: 100, unidad: "M2", precio_unitario: 120000, total: 12000000, soporte: sop(5) }),
  lin({ clave: "l-32", descripcion: "3.2 Demolición intensiva", actividad: "DEMOLICION", grupo_comparacion: "DEM_M2", cantidad: 100, unidad: "M2", precio_unitario: 80200, total: 8020000, soporte: sop(5) }),
  lin({ clave: "l-directos", descripcion: "Costos directos (suma de los capítulos 1, 2 y 3)", total: 20150154 }),
  lin({ clave: "l-admin", descripcion: "Administración (20%)", base_economica: "AIU", total: 4030030.8 }),
  lin({ clave: "l-total", descripcion: "Total reportado", base_economica: "TOTAL", total: 24500000 }),
];

const exp = (extra: Record<string, unknown> = {}): any => ({
  expediente: { id: 1, tipo_intervencion: "DEMOLICION", fecha_documento: "2026-10-05" },
  cotizaciones: [{ id: 1, clave: "o1", proveedor: "ACME S.A.S.", fecha_oferta: null, lineas: lineas() }],
  edificios: [{ id: 1, nombre: "Edificio ficticio" }],
  valores: [{ id: 1, tipo: "PRESUPUESTO_OFICIAL", importe: 24500000, concepto: "Presupuesto", estado_soporte: "RESPALDADO", soporte: sop(71) }],
  contratacion: { contratos: [] },
  cotizaciones_edificio: [],
  ...extra,
});

describe("desglose por capítulo", () => {
  it("agrupa los subítems bajo su capítulo y no los suma otra vez", () => {
    const [g] = desglose(exp());
    expect(g.filas.map((f) => f.numero)).toEqual(["1", "2", "3"]);
    expect(g.filas[2].hijos.map((h) => h.numero)).toEqual(["3.1", "3.2"]);
    expect(g.costoDirecto.suma).toBe(100004 + 49950 + 20000200);
    expect(g.costoDirecto.reportado).toBe(20150154);
    expect(g.costoDirecto.coincide).toBe(true);
  });
  it("separa el consolidado (AIU y total) de las partidas", () => {
    const [g] = desglose(exp());
    expect(g.consolidado.map((c) => c.clave)).toEqual(["l-directos", "l-admin", "l-total"]);
  });
});

describe("frentes de un costo directo por unidad", () => {
  it("los frentes se cuelgan de su costo directo y no se suman aparte", () => {
    const d = exp({ cotizaciones: [{ id: 1, clave: "o1", proveedor: "ACME", fecha_oferta: null, lineas: [
      lin({ clave: "l-directo", descripcion: "Costo directo unitario", cantidad: 100, unidad: "M3", precio_unitario: 1000, total: 100000 }),
      lin({ clave: "l-total-equiv", descripcion: "Total por m³", base_economica: "TOTAL", derivado: true, cantidad: 100, unidad: "M3", precio_unitario: 1200, total: 120000 }),
      lin({ clave: "l-frente-a", descripcion: "Edificio A – costo directo", cantidad: 60, unidad: "M3", precio_unitario: 1000, total: 60000 }),
      lin({ clave: "l-frente-b", descripcion: "Edificio B – costo directo", cantidad: 40, unidad: "M3", precio_unitario: 1000, total: 40000 }),
    ] }] });
    const [g] = desglose(d);
    expect(g.filas.map((f) => f.clave)).toEqual(["l-directo", "l-total-equiv"]);
    expect(g.filas[0].hijos).toHaveLength(2);
    expect(g.costoDirecto.suma).toBe(100000);
  });
});

const AREA = { estado: "DOCUMENTADA", valor: 100, tipo: "CONSTRUIDA", cita: "área construida de 100 m2", motivo: null, soporte: { version_id: 3, documento: "ficha.pdf", pagina: 4 } };

describe("área y precio por m²", () => {
  it("las cantidades de las partidas en m² no se toman como superficie del edificio", () => {
    const d = exp();
    const [g] = desglose(d);
    expect(g.filas[1].cantidad).toBe(99.9);
    expect(areaDocumentada(d)).toBeNull();
    const h = encabezadoM2(d);
    expect(h.area).toBeNull();
    expect(h.costoDirecto).toBeNull();
    expect(h.presupuesto).toBeNull();
  });
  it("con una superficie documentada divide cada importe y marca el resultado como calculado", () => {
    const h = encabezadoM2(exp({ area_precio: AREA }));
    expect(h.area).toMatchObject({ valor: 100, tipo: "CONSTRUIDA" });
    expect(h.area?.soporte).toMatchObject({ documento: "ficha.pdf", pagina: 4 });
    expect(h.costoDirecto).toMatchObject({ valor: porM2(20150154, 100), origen: "CALCULADO", importe: 20150154 });
    expect(h.presupuesto).toMatchObject({ valor: 245000, origen: "CALCULADO" });
    expect(h.presupuesto?.importeSoporte?.pagina).toBe(71);
  });
  it("sin superficie documentada muestra el motivo del servidor y no calcula", () => {
    const h = encabezadoM2(exp({ area_precio: { estado: "PENDIENTE", valor: null, motivo: "Superficie no documentada para este edificio." } }));
    expect(h.motivo).toBe("Superficie no documentada para este edificio.");
    expect(h.costoDirecto).toBeNull();
  });
  it("con superficies en conflicto no calcula", () => {
    const h = encabezadoM2(exp({ area_precio: { estado: "CONFLICTO", valor: null, motivo: "Superficies distintas" } }));
    expect(h.area).toBeNull();
    expect(h.presupuesto).toBeNull();
  });
  it("las grúas no tienen precio por m²", () => {
    expect(encabezadoM2(exp({ area_precio: AREA, expediente: { id: 4, tipo_intervencion: "IZAJE_GRUAS" } })).aplica).toBe(false);
  });
});

describe("historial y variación", () => {
  const filaDemolicion = (d: any) => desglose(d)[0].filas[2];

  it("distingue etapas y no calcula variación frente a valores globales", () => {
    const d = exp({
      cotizaciones_edificio: [{ id: 9, proveedor: "ACME S.A.S.", concepto: "Ítem 4: demolición total a ras de piso", actividades: "Demolición total", importe: 429000000, base: "COSTO_DIRECTO", fecha_oferta: "2026-09-08", referencia_oferta: "Cotización 116", soporte: sop(8) }],
      contratacion: { contratos: [{ id: 3, valor: 30000000, numero: "C-1", contratista: "ACME", fecha_acto: "2026-10-19", soporte: sop(1) }] },
    });
    const h = historial(d, filaDemolicion(d));
    expect(h.map((e) => e.etapa)).toEqual(expect.arrayContaining(["COTIZADO", "PRESUPUESTADO", "CONTRATADO"]));
    expect(h[0].fecha).toBe("2026-09-08"); // ordenado por fecha: la oferta global es la primera
    const global = h.find((e) => e.clave === "ed-9")!;
    expect(global.difPct).toBeNull();
    expect(global.motivo).toMatch(/global/);
    expect(global.motivo).toMatch(/no indica el área/);
    expect(h.find((e) => e.etapa === "CONTRATADO")!.motivo).toMatch(/anexo de precios unitarios/);
    expect(h.filter((e) => e.esReferencia)).toHaveLength(1);
  });

  it("compara con otra oferta solo si coinciden actividad, unidad y tratamiento de AIU e IVA", () => {
    const otra = (extra: Record<string, unknown>) => ({ id: 2, clave: "o2", proveedor: "OTRA", fecha_oferta: "2026-09-01", lineas: [lin({ clave: "x1", proveedor: "OTRA", descripcion: "Demolición", actividad: "DEMOLICION", grupo_comparacion: "DEM_M2", cantidad: 100, unidad: "M2", precio_unitario: 220000, total: 22000000, ...extra })] });
    const d = exp();
    d.cotizaciones.push(otra({}));
    const ok = historial(d, filaDemolicion(d)).find((e) => e.clave.startsWith("of-"))!;
    expect(ok.difCop).toBe(20000);
    expect(ok.difPct).toBeCloseTo(10, 5);

    const d2 = exp();
    d2.cotizaciones.push(otra({ base_economica: "TOTAL" }));
    expect(historial(d2, filaDemolicion(d2)).find((e) => e.clave.startsWith("of-"))!.motivo).toMatch(/AIU e IVA/);

    const d3 = exp();
    d3.cotizaciones.push(otra({ unidad: "M3" }));
    expect(historial(d3, filaDemolicion(d3)).find((e) => e.clave.startsWith("of-"))!.motivo).toMatch(/unidad difiere/);
  });

  it("las partidas de una misma oferta no se comparan entre sí", () => {
    const d = exp({
      cotizaciones: [{ id: 1, clave: "o1", proveedor: "ACME", fecha_oferta: "2026-08-18", lineas: [lin({ descripcion: "Grúa 80 t", cantidad: 1, unidad: "UND", precio_unitario: 6400000, total: 6400000 }), lin({ descripcion: "Grúa 275 t", cantidad: 1, unidad: "UND", precio_unitario: 53700000, total: 53700000 })] }],
    });
    const fila = desglose(d)[0].filas[0];
    expect(historial(d, fila).filter((e) => e.difPct !== null)).toHaveLength(0);
  });

  it("si solo existe un precio lo muestra con su soporte", () => {
    const d = exp({ valores: [], contratacion: { contratos: [] }, cotizaciones_edificio: [] });
    const h = historial(d, desglose(d)[0].filas[0]);
    expect(h).toHaveLength(1);
    expect(h[0].soporte?.pagina).toBe(10);
  });
});
