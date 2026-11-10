"use client";
import { useMemo } from "react";
import { Table } from "antd";
import { ACTIVIDAD_ETQ, UNIDAD_ETQ, cop, precioConUnidad } from "@/lib/format";
import type { DetalleExpediente } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";

/**
 * Compara precios unitarios de partidas equivalentes entre empresas (mismo grupo de comparación, unidad y base).
 * Solo existe para responder «¿a cuánto cotiza cada empresa la misma partida?»; la tabla es la fuente verificable.
 */
export function BarrasPrecios({ d }: { d: DetalleExpediente }) {
  const grupos = useMemo(() => {
    const m = new Map<string, { clave: string; actividad: string; unidad: string; base: string; filas: { proveedor: string; precio: number; soporte: any }[] }>();
    for (const o of d.cotizaciones) {
      for (const l of o.lineas) {
        if (!l.grupo_comparacion || l.precio_unitario === null || l.unidad === "GLOBAL") continue;
        const k = `${l.grupo_comparacion}|${l.unidad}|${l.base_economica}`;
        const g = m.get(k) ?? { clave: k, actividad: l.actividad, unidad: l.unidad, base: l.base_economica, filas: [] };
        g.filas.push({ proveedor: o.proveedor, precio: l.precio_unitario, soporte: l.soporte });
        m.set(k, g);
      }
    }
    return [...m.values()].filter((g) => new Set(g.filas.map((f) => f.proveedor)).size >= 2);
  }, [d.cotizaciones]);

  if (grupos.length === 0) return null;
  return (
    <section aria-labelledby="barras">
      <h2 id="barras" style={{ fontSize: 18, margin: "0 0 4px" }}>Precio unitario de partidas equivalentes</h2>
      <p className="texto-secundario" style={{ fontSize: 13.5, margin: "0 0 12px" }}>Solo partidas con la misma actividad, unidad y base económica. Las diferencias de alcance entre empresas se señalan en la pestaña de cotizaciones.</p>
      <div style={{ display: "grid", gap: 20 }}>
        {grupos.map((g) => {
          const max = Math.max(...g.filas.map((f) => f.precio));
          const min = Math.min(...g.filas.map((f) => f.precio));
          return (
            <figure key={g.clave} style={{ margin: 0 }}>
              <figcaption style={{ fontWeight: 600, marginBottom: 8 }}>{ACTIVIDAD_ETQ[g.actividad] ?? g.actividad} · por {UNIDAD_ETQ[g.unidad] ?? g.unidad}{max !== min && <span className="texto-secundario" style={{ fontWeight: 400 }}> · diferencia {(((max - min) / min) * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} % entre la menor y la mayor</span>}</figcaption>
              <div role="img" aria-label={`Precios unitarios: ${g.filas.map((f) => `${f.proveedor} ${cop(f.precio)}`).join("; ")}`} style={{ display: "grid", gap: 6 }}>
                {g.filas.map((f, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 200px) 1fr", gap: 12, alignItems: "center" }}>
                    <span className="largo" style={{ fontSize: 14 }}>{f.proveedor}</span>
                    <div style={{ height: 22, background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 4 }}>
                      <div style={{ width: `${(f.precio / max) * 100}%`, height: "100%", background: PALETA.tinta, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
              <Table
                style={{ marginTop: 8 }}
                size="small"
                pagination={false}
                rowKey={(r) => r.proveedor + r.precio}
                dataSource={g.filas}
                columns={[
                  { title: "Empresa", dataIndex: "proveedor" },
                  { title: "Precio unitario", align: "right", render: (_, r) => <span className="cifra">{precioConUnidad(r.precio, g.unidad)}</span> },
                  { title: "Soporte", render: (_, r) => <SoporteLink soporte={r.soporte} corto /> },
                ]}
              />
            </figure>
          );
        })}
      </div>
    </section>
  );
}
