import type { DetalleExpediente, SoporteRef } from "@/types/contratacion";

export interface OfertaSinTotal {
  proveedor: string;
  partidas: number;
  sumaCostoDirecto: number | null;
  partidasOtraBase: number;
  soportes: SoporteRef[];
}

/** Ofertas con partidas cuyo total no consta como valor cotizado: se muestran las partidas, nunca un total inventado. */
export function ofertasSinTotal(d: DetalleExpediente): OfertaSinTotal[] {
  const out: OfertaSinTotal[] = [];
  for (const o of d.cotizaciones) {
    const resumen = d.comparacion.cotizaciones_resumen.find((r) => r.clave === o.clave);
    if (resumen && resumen.valor_cotizado.length > 0) continue;
    if (o.lineas.length === 0) continue;
    const directas = o.lineas.filter((l) => l.base_economica === "COSTO_DIRECTO" && l.total !== null);
    const vistos = new Set<string>();
    const soportes: SoporteRef[] = [];
    for (const l of o.lineas) {
      if (!l.soporte) continue;
      const k = `${l.soporte.version_id}|${l.soporte.pagina ?? ""}|${l.soporte.hoja ?? ""}|${l.soporte.celda ?? ""}`;
      if (!vistos.has(k)) { vistos.add(k); soportes.push(l.soporte); }
    }
    out.push({
      proveedor: o.proveedor,
      partidas: o.lineas.length,
      sumaCostoDirecto: directas.length ? directas.reduce((s, l) => s + (l.total ?? 0), 0) : null,
      partidasOtraBase: o.lineas.length - directas.length,
      soportes,
    });
  }
  return out;
}

/** Qué documento concreto permitiría avanzar en este expediente. */
export function documentosParaAvanzar(d: DetalleExpediente): string[] {
  const r: string[] = [];
  const a = d.analisis_precios;
  if (!a.contratado.sustentado) {
    r.push("Contrato o acto de adjudicación con su anexo de partidas. Con él se comparan las partidas que tengan referencia independiente de la misma actividad, unidad y alcance.");
  } else if (!a.rango) {
    r.push("Cotizaciones o estudio de mercado independientes, con actividad, unidad y alcance equivalentes, para comparar las partidas contratadas.");
  }
  for (const o of ofertasSinTotal(d)) r.push(`Documento que fije el total de la oferta de ${o.proveedor}, hoy solo conocida por sus partidas.`);
  const ejec = d.ejecucion.valores.filter((v) => v.estado_soporte === "CITADO_SIN_ACTA");
  if (new Set(ejec.map((v) => v.importe)).size > 1) r.push("Acta de ejecución o de pago que permita conciliar los importes de ejecución citados.");
  else if (ejec.length === 1) r.push("Acta de ejecución o de pago que respalde el importe de ejecución citado.");
  return r;
}

import type { CotizacionEdificio } from "@/types/contratacion";

/** Una cotización por documento y fecha (PDF); la referencia de Excel con el mismo importe se agrega a esa misma cotización. */
export function agruparCotizaciones(cs: CotizacionEdificio[]): CotizacionEdificio[][] {
  const grupos: CotizacionEdificio[][] = [];
  for (const c of cs.filter((x) => x.soporte.pagina !== null)) grupos.push([c]);
  for (const c of cs.filter((x) => x.soporte.pagina === null)) {
    const g = grupos.find((x) => x[0].proveedor === c.proveedor && x[0].importe === c.importe && x[0].edificio_id === c.edificio_id);
    if (g) g.push(c);
    else grupos.push([c]);
  }
  return grupos;
}
