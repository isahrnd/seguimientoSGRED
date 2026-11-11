import type { DetalleExpediente, LineaPrecio, SoporteRef } from "@/types/contratacion";

/**
 * Desglose de precios por actividad. Solo organiza y calcula con lo que consta en las fuentes: cada partida conserva su
 * soporte, un capítulo no se cuenta otra vez con sus subítems y un precio por m² se marca como «calculado» (importe ÷ área).
 */

export type Nivel = "capitulo" | "partida" | "componente";

export interface Partida {
  id: string;
  clave: string;
  concepto: string;
  nivel: Nivel;
  numero: string | null;
  unidad: string;
  cantidad: number | null;
  precioUnitario: number | null;
  total: number | null;
  base: string;
  derivado: boolean;
  actividad: string;
  soporte: SoporteRef | null;
  nota: string | null;
  oferta: string;
  fechaOferta: string | null;
  hijos: Partida[];
}

export interface Resumen {
  clave: string;
  concepto: string;
  total: number;
  base: string;
  soporte: SoporteRef | null;
  nota: string | null;
}

export interface GrupoOferta {
  proveedor: string;
  fechaOferta: string | null;
  filas: Partida[];
  consolidado: Resumen[];
  /** Suma de las partidas de primer nivel (cada una una sola vez) frente al «costos directos» que reporta el documento. */
  costoDirecto: { suma: number | null; reportado: number | null; coincide: boolean | null; soporte: SoporteRef | null };
}

const RESUMEN_BASES = new Set(["AIU", "IMPUESTOS"]);

const esResumen = (l: LineaPrecio) =>
  RESUMEN_BASES.has(l.base_economica) || (l.unidad === "GLOBAL" && l.cantidad === null) || /^costos? directos? \(suma/i.test(l.descripcion);

function aPartida(l: LineaPrecio, oferta: string, fechaOferta: string | null, nivel: Nivel, numero: string | null): Partida {
  return {
    id: `${l.id}`, clave: l.clave, concepto: l.descripcion, nivel, numero, unidad: l.unidad, cantidad: l.cantidad, precioUnitario: l.precio_unitario,
    total: l.total, base: l.base_economica, derivado: l.derivado, actividad: l.actividad, soporte: l.soporte, nota: l.nota, oferta, fechaOferta, hijos: [],
  };
}

export function desglose(d: DetalleExpediente): GrupoOferta[] {
  return d.cotizaciones
    .filter((o) => o.lineas.length > 0)
    .map((o) => {
      const resumenes: Resumen[] = [];
      const base: { l: LineaPrecio }[] = [];
      for (const l of o.lineas) {
        if (esResumen(l) && l.total !== null) resumenes.push({ clave: l.clave, concepto: l.descripcion, total: l.total, base: l.base_economica, soporte: l.soporte, nota: l.nota });
        else base.push({ l });
      }
      const filas: Partida[] = [];
      const porCapitulo = new Map<string, Partida>();
      const hijosPendientes: { p: Partida; padre: string }[] = [];
      for (const { l } of base) {
        const cap = /^Cap[ií]tulo\s+(\d+)/i.exec(l.descripcion);
        const sub = /^(\d+)\.(\d+)\b/.exec(l.descripcion);
        if (cap) {
          const p = aPartida(l, o.proveedor, o.fecha_oferta, "capitulo", cap[1]);
          porCapitulo.set(cap[1], p);
          filas.push(p);
        } else if (sub) {
          hijosPendientes.push({ p: aPartida(l, o.proveedor, o.fecha_oferta, "componente", `${sub[1]}.${sub[2]}`), padre: sub[1] });
        } else if (/frente/i.test(l.clave)) {
          hijosPendientes.push({ p: aPartida(l, o.proveedor, o.fecha_oferta, "componente", null), padre: "directo" });
        } else {
          const p = aPartida(l, o.proveedor, o.fecha_oferta, "partida", null);
          filas.push(p);
        }
      }
      // Los componentes se cuelgan de su capítulo (o de la partida de costo directo de la que son frentes) y no suman aparte.
      for (const h of hijosPendientes) {
        let padre = porCapitulo.get(h.padre);
        if (!padre && h.padre === "directo") padre = filas.find((f) => (f.nivel === "partida" || f.nivel === "capitulo") && f.base === "COSTO_DIRECTO" && !f.derivado && f.total !== null && /directo/i.test(`${f.clave} ${f.concepto}`));
        if (padre) {
          padre.hijos.push(h.p);
          if (padre.nivel === "partida") padre.nivel = "capitulo";
        } else filas.push({ ...h.p, nivel: "partida" });
      }
      const principales = filas.filter((f) => f.base === "COSTO_DIRECTO" && !f.derivado && f.total !== null);
      const suma = principales.length ? principales.reduce((s, f) => s + (f.total ?? 0), 0) : null;
      const rep = resumenes.find((r) => /^costos? directos?/i.test(r.concepto));
      const coincide = suma !== null && rep ? Math.abs(suma - rep.total) <= Math.max(1, rep.total * 1e-6) : null;
      return {
        proveedor: o.proveedor,
        fechaOferta: o.fecha_oferta,
        filas,
        consolidado: resumenes,
        costoDirecto: { suma, reportado: rep?.total ?? null, coincide, soporte: rep?.soporte ?? null },
      };
    });
}

export const soporteDePagina = (s: { version_id: number; documento: string | null; pagina: number } | null | undefined): SoporteRef | null =>
  s ? ({ version_id: s.version_id, documento_id: 0, documento: s.documento, numero_version: 1, es_vigente: true, version_vigente_id: null, pagina: s.pagina, hoja: null, celda: null } as SoporteRef) : null;

export const TIPO_CIFRA_ETQ: Record<string, string> = {
  CANTIDAD: "Cantidad de referencia de la propuesta (no es la superficie del edificio)", LOTE: "Área predial", CONSTRUIDA: "Área construida", INTERVENCION: "Área de intervención", DEMOLICION: "Área de demolición", OTRA: "Otra cifra en m²",
};

export interface AreaDocumentada {
  valor: number;
  /** Documento y página que declaran la superficie. */
  soporte: SoporteRef | null;
  tipo: string | null;
  cita: string | null;
}

/**
 * Superficie documentada: la que el servidor acepta (una sola, declarada de forma expresa en un documento y referida al único edificio del proceso).
 * No se deduce de las cantidades de las partidas: cada capítulo conserva la suya en m² como cantidad de obra, no como superficie del edificio.
 */
export function areaDocumentada(d: DetalleExpediente): AreaDocumentada | null {
  const a = d.area_precio;
  if (!a || a.estado !== "DOCUMENTADA" || a.valor === null) return null;
  const s = a.soporte ? ({ version_id: a.soporte.version_id, documento_id: 0, documento: a.soporte.documento, numero_version: 1, es_vigente: true, version_vigente_id: null, pagina: a.soporte.pagina, hoja: null, celda: null } as SoporteRef) : null;
  return { valor: a.valor, soporte: s, tipo: a.tipo ?? null, cita: a.cita ?? null };
}

export interface PrecioM2 {
  valor: number | null;
  origen: "DOCUMENTO" | "CALCULADO";
  importe: number | null;
  importeSoporte: SoporteRef | null;
  etiqueta: string;
}

export const porM2 = (importe: number, area: number) => Math.round(importe / area);

/** Un precio por m² solo se calcula con un importe y un área respaldados, y para un solo predio o edificio. */
export function encabezadoM2(d: DetalleExpediente): {
  aplica: boolean;
  area: AreaDocumentada | null;
  costoDirecto: PrecioM2 | null;
  presupuesto: PrecioM2 | null;
  motivo: string | null;
} {
  const g = desglose(d)[0];
  const area = areaDocumentada(d);
  const esGruas = d.expediente.tipo_intervencion === "IZAJE_GRUAS";
  if (esGruas) return { aplica: false, area: null, costoDirecto: null, presupuesto: null, motivo: "Servicio por unidad de equipo: no aplica un precio por m²." };
  if (!area) return { aplica: true, area: null, costoDirecto: null, presupuesto: null, motivo: d.area_precio?.motivo ?? "Superficie pendiente de documentar" };
  const dir = g.costoDirecto.reportado ?? g.costoDirecto.suma;
  const oficial = d.valores.find((v) => v.tipo === "PRESUPUESTO_OFICIAL");
  return {
    aplica: true,
    area,
    costoDirecto: dir !== null ? { valor: porM2(dir, area.valor), origen: "CALCULADO", importe: dir, importeSoporte: g.costoDirecto.soporte ?? g.filas[0]?.soporte ?? null, etiqueta: "Costo directo por m²" } : null,
    presupuesto: oficial ? { valor: porM2(oficial.importe, area.valor), origen: "CALCULADO", importe: oficial.importe, importeSoporte: oficial.soporte, etiqueta: "Presupuesto oficial por m² (con AIU e IVA)" } : null,
    motivo: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------

export type Etapa = "COTIZADO" | "PRESUPUESTADO" | "CONTRATADO" | "EJECUTADO";

export interface EntradaPrecio {
  clave: string;
  fecha: string | null;
  fuente: string;
  etapa: Etapa;
  unidad: string | null;
  cantidad: number | null;
  precio: number | null;
  total: number | null;
  base: string | null;
  soporte: SoporteRef | null;
  esReferencia: boolean;
  difCop: number | null;
  difPct: number | null;
  motivo: string | null;
}

export const ETAPA_ETQ: Record<Etapa, string> = { COTIZADO: "Cotizado", PRESUPUESTADO: "Presupuestado", CONTRATADO: "Contratado", EJECUTADO: "Ejecutado" };

const clasificar = (t: string) =>
  /gesti[oó]n integral|rcd/i.test(t) && /transporte|gesti/i.test(t) && !/demolici/i.test(t) ? "GESTION_INTEGRAL" : /demolici|desmontaje/i.test(t) ? "DEMOLICION" : /transporte/i.test(t) ? "TRANSPORTE" : "OTRO";

/**
 * «¿Cómo cambió este precio?»: todas las fuentes de la misma actividad ordenadas por fecha. La variación solo se calcula entre
 * precios unitarios con la misma actividad, unidad y tratamiento de AIU e IVA; si no, se dice el motivo concreto.
 */
export function historial(d: DetalleExpediente, fila: Partida): EntradaPrecio[] {
  const ref: EntradaPrecio = {
    clave: `ref-${fila.id}`, fecha: fila.fechaOferta ?? d.expediente.fecha_documento, fuente: fila.oferta, etapa: "COTIZADO", unidad: fila.unidad, cantidad: fila.cantidad,
    precio: fila.precioUnitario, total: fila.total, base: fila.base, soporte: fila.soporte, esReferencia: true, difCop: null, difPct: null, motivo: null,
  };
  const otras: EntradaPrecio[] = [];
  const comparar = (e: EntradaPrecio, sinAlcanceEquivalente?: string) => {
    if (e.precio === null || fila.precioUnitario === null) { e.motivo ??= "No hay precio unitario para comparar."; return; }
    if (sinAlcanceEquivalente) { e.motivo = sinAlcanceEquivalente; return; }
    if (e.unidad !== fila.unidad) { e.motivo = e.unidad === "GLOBAL" || e.unidad === null ? "Es global y no indica el área ni la cantidad." : `La unidad difiere (${e.unidad} frente a ${fila.unidad}).`; return; }
    if (e.base !== fila.base) { e.motivo = "Difieren en el tratamiento de AIU e IVA."; return; }
    e.difCop = e.precio - fila.precioUnitario;
    e.difPct = fila.precioUnitario !== 0 ? (e.difCop / fila.precioUnitario) * 100 : null;
  };

  // Partidas de OTRAS ofertas con el mismo grupo de comparación y nivel. Dentro de una misma oferta las partidas son rubros distintos
  // (p. ej. grúa de 80 t y de 275 t) y no se comparan entre sí.
  const grupoRef = d.cotizaciones.flatMap((o) => o.lineas).find((l) => String(l.id) === fila.id)?.grupo_comparacion ?? null;
  if (grupoRef) {
    for (const o of d.cotizaciones) {
      if (o.proveedor === fila.oferta && o.fecha_oferta === fila.fechaOferta) continue;
      for (const l of o.lineas.filter((x) => x.grupo_comparacion === grupoRef)) {
        const e: EntradaPrecio = { clave: `of-${l.id}`, fecha: o.fecha_oferta, fuente: o.proveedor, etapa: "COTIZADO", unidad: l.unidad, cantidad: l.cantidad, precio: l.precio_unitario, total: l.total, base: l.base_economica, soporte: l.soporte, esReferencia: false, difCop: null, difPct: null, motivo: null };
        comparar(e);
        otras.push(e);
      }
    }
  }
  // Cotizaciones del mismo proveedor atribuidas a los edificios del proceso (otra fecha o alcance).
  if (fila.nivel !== "componente") {
    for (const c of d.cotizaciones_edificio.filter((x) => x.soporte.pagina !== null)) {
      if (clasificar(`${c.actividades ?? ""} ${c.concepto}`) !== fila.actividad) continue;
      const e: EntradaPrecio = {
        clave: `ed-${c.id}`, fecha: c.fecha_oferta, fuente: `${c.proveedor.replace(/ S\.A\.S\.?$/, "")} · ${c.referencia_oferta ?? "cotización"}`, etapa: "COTIZADO", unidad: "GLOBAL", cantidad: null, precio: null, total: c.importe,
        base: c.base, soporte: c.soporte, esReferencia: false, difCop: null, difPct: null, motivo: `La ${c.referencia_oferta ?? "oferta"} es global (una suma por edificio) y no indica el área.`,
      };
      otras.push(e);
    }
  }
  // Valores globales del expediente: no generan precio unitario por actividad.
  const global = (clave: string, fecha: string | null, fuente: string, etapa: Etapa, total: number, base: string | null, soporte: SoporteRef | null, motivo: string): EntradaPrecio =>
    ({ clave, fecha, fuente, etapa, unidad: "GLOBAL", cantidad: null, precio: null, total, base, soporte, esReferencia: false, difCop: null, difPct: null, motivo });
  for (const v of d.valores.filter((x) => x.tipo === "PRESUPUESTO_OFICIAL")) otras.push(global(`pr-${v.id}`, d.expediente.fecha_documento, "Presupuesto oficial", "PRESUPUESTADO", v.importe, "TOTAL", v.soporte, "Cubre todas las actividades con AIU e IVA: no es un precio unitario de esta actividad."));
  for (const c of d.contratacion.contratos) otras.push(global(`co-${c.id}`, c.fecha_acto ?? c.firma_fecha, `${c.contratista ?? "Contrato"} · ${c.numero ?? ""}`.trim(), "CONTRATADO", c.valor, "TOTAL", c.soporte, "Valor global del contrato: falta el anexo de precios unitarios para comparar esta actividad."));
  for (const v of d.valores.filter((x) => x.tipo === "EJECUTADO")) otras.push(global(`ej-${v.id}`, null, v.concepto, "EJECUTADO", v.importe, null, v.soporte, v.estado_soporte === "RESPALDADO" ? "Valor ejecutado global." : "Citado sin acta: no se concilia con precios unitarios."));

  const orden = (e: EntradaPrecio) => (e.fecha ? Date.parse(e.fecha) : Number.MAX_SAFE_INTEGER);
  return [ref, ...otras].sort((a, b) => orden(a) - orden(b) || Number(b.esReferencia) - Number(a.esReferencia));
}
