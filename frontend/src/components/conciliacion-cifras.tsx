"use client";
import { Alert, Table, Tag } from "antd";
import { cop, fechaCorta } from "@/lib/format";
import { agruparCotizaciones } from "@/lib/oferta";
import type { DetalleExpediente, SoporteRef } from "@/types/contratacion";
import { SoporteLink } from "./soporte-link";

interface Fila {
  clave: string;
  cifra: number;
  categoria: string;
  base: string;
  fuente: string;
  soportes: (SoporteRef | null)[];
  fecha: string;
  alcance: string;
  actividades: string;
  cantidad: string;
  aiu: string;
  nota?: string | null;
  costoDirecto: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Conciliación de las cifras de un mismo proveedor que aparecen en fuentes distintas (otra fecha, alcance o base).
 * Cada importe conserva la categoría que respalda su fuente y nunca se suma ni se sustituye por otro.
 */
export function ConciliacionCifras({ d }: { d: DetalleExpediente }) {
  const proveedores = new Set(d.cotizaciones.map((c) => norm(c.proveedor).split(" ")[0]));
  const externas = agruparCotizaciones(d.cotizaciones_edificio.filter((c) => proveedores.has(norm(c.proveedor).split(" ")[0])));
  if (externas.length === 0) return null;

  const lineas = d.cotizaciones.flatMap((o) => o.lineas);
  const directo = lineas.find((l) => /^costos directos/i.test(l.descripcion));
  const aiuLineas = lineas.filter((l) => l.base_economica === "AIU" || l.base_economica === "IMPUESTOS").map((l) => l.descripcion.replace(/\s*\(.*?\)\s*$/, (m) => m.replace(/indicado/, "").trim() ? m : "").trim());
  const cap = lineas.filter((l) => /^Cap[ií]tulo/i.test(l.descripcion));
  const m2 = cap[0]?.cantidad;
  const cotizado = d.valores.find((v) => v.tipo === "COTIZADO");
  const oficial = d.valores.find((v) => v.tipo === "PRESUPUESTO_OFICIAL");
  const proveedor = d.cotizaciones[0]?.proveedor ?? "";
  const alcanceExp = d.expediente.intervencion;

  const filas: Fila[] = [];
  for (const g of externas) {
    const c = g[0];
    filas.push({
      clave: `ext-${c.id}`, cifra: c.importe, categoria: "Cotización por edificio", base: c.base === "COSTO_DIRECTO" ? "Costo directo, antes de AIU e IVA" : "Total según la fuente",
      fuente: `${c.referencia_oferta ?? "Cotización"} · ${c.soporte.documento ?? ""}`, soportes: g.map((x) => x.soporte), fecha: c.fecha_oferta ? fechaCorta(c.fecha_oferta) : "Pendiente de soporte",
      alcance: `${c.concepto}. ${c.alcance_oferta ?? ""}`.trim(), actividades: c.actividades ?? "Pendiente de soporte", cantidad: c.cantidad ?? "Pendiente de soporte", aiu: c.tratamiento_aiu ?? "Pendiente de soporte",
      nota: c.nota, costoDirecto: c.base === "COSTO_DIRECTO",
    });
  }
  if (directo?.total != null) {
    filas.push({
      clave: "exp-directo", cifra: directo.total, categoria: "Costos directos del APU actualizado", base: "Costo directo, antes de AIU e IVA", fuente: `${proveedor} · análisis del sector`, soportes: [directo.soporte],
      fecha: "Análisis del 05/10/2026; fecha de la propuesta actualizada: pendiente de soporte", alcance: alcanceExp, actividades: cap.map((l) => l.descripcion.replace(/^Cap[ií]tulo \d+\.\s*/i, "")).join("; ") || "Pendiente de soporte",
      cantidad: m2 != null ? `${m2.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m² (sin equivalencia a volumen)` : "Pendiente de soporte", aiu: "Sin AIU ni IVA", costoDirecto: true,
    });
  }
  if (cotizado) {
    filas.push({
      clave: "exp-cotizado", cifra: cotizado.importe, categoria: "Cotización (total del APU actualizado)", base: "Total con AIU e IVA sobre utilidad", fuente: `${proveedor} · análisis del sector`, soportes: [cotizado.soporte],
      fecha: "Análisis del 05/10/2026; fecha de la propuesta actualizada: pendiente de soporte", alcance: alcanceExp, actividades: "Los mismos capítulos del APU", cantidad: m2 != null ? `${m2.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m²` : "Pendiente de soporte",
      aiu: aiuLineas.length ? aiuLineas.join("; ") : "Pendiente de soporte", costoDirecto: false,
    });
  }
  if (oficial) {
    filas.push({
      clave: "exp-oficial", cifra: oficial.importe, categoria: "Presupuesto oficial", base: "Total con AIU e IVA sobre utilidad", fuente: "Análisis del sector (el presupuesto se establece a partir de la propuesta actualizada)", soportes: [oficial.soporte],
      fecha: "Análisis del 05/10/2026", alcance: oficial.concepto, actividades: "—", cantidad: "—", aiu: "Igual que el total del APU actualizado", costoDirecto: false,
    });
  }

  // Diferencias solo entre costos directos: misma base económica.
  const directos = filas.filter((f) => f.costoDirecto);
  const ref = directos.find((f) => f.clave === "exp-directo");
  const comparaciones = ref ? directos.filter((f) => f.clave !== ref.clave).map((f) => ({ f, dif: f.cifra - ref.cifra, pct: ((f.cifra - ref.cifra) / ref.cifra) * 100 })) : [];

  return (
    <section aria-labelledby="conc" style={{ display: "grid", gap: 12 }}>
      <h2 id="conc" style={{ fontSize: 18, margin: 0 }}>Conciliación de cifras de {proveedor.replace(/ S\.A\.S\.?$/, "")}</h2>
      <p className="texto-secundario" style={{ margin: 0, maxWidth: 900 }}>
        Cada importe conserva la categoría de su fuente. No se suman ni se sustituyen entre sí, y no se atribuye a este proceso una cotización por edificio mientras no conste que es el mismo alcance.
      </p>
      <Table<Fila>
        size="middle"
        rowKey="clave"
        dataSource={filas}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          { title: "Cifra", key: "c", width: 210, render: (_, f) => <div><div className="cifra" style={{ fontSize: 18, fontWeight: 700 }}>{cop(f.cifra)}</div><Tag>{f.categoria}</Tag><div className="texto-secundario" style={{ fontSize: 12.5 }}>{f.base}</div></div> },
          { title: "Fuente, fecha y página", key: "f", width: 250, render: (_, f) => <div className="largo"><div style={{ fontSize: 13.5 }}>{f.fuente}</div><div className="texto-secundario" style={{ fontSize: 12.5 }}>{f.fecha}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{f.soportes.map((s, i) => <SoporteLink key={i} soporte={s} corto />)}</div></div> },
          { title: "Alcance y actividades", key: "a", width: 280, render: (_, f) => <div className="largo" style={{ fontSize: 13.5 }}>{f.alcance}<div className="texto-secundario">{f.actividades}</div></div> },
          { title: "Cantidades", key: "q", width: 150, render: (_, f) => <span style={{ fontSize: 13.5 }}>{f.cantidad}</span> },
          { title: "AIU e IVA", key: "i", width: 250, render: (_, f) => <div className="largo" style={{ fontSize: 13.5 }}>{f.aiu}</div> },
        ]}
      />
      {comparaciones.map(({ f, dif, pct }) => (
        <Alert key={f.clave} type="warning" showIcon
          message={<>Diferencia entre costos directos: <span className="cifra">{dif > 0 ? "+" : ""}{cop(dif)}</span> ({pct > 0 ? "+" : ""}{pct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %) respecto del APU actualizado</>}
          description={<>Frente a {f.fuente.split(" · ")[0]}. Es una diferencia documentada, no una conclusión sobre sobrecostos: las fuentes difieren en fecha, alcance, cantidades y porcentaje de administración, y la cotización por edificio no trae área ni cantidades. {f.nota}</>} />
      ))}
    </section>
  );
}
