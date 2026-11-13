"use client";
import { cop } from "@/lib/format";

export interface DatoBarra { etiqueta: string; valor: number; nota?: string; color?: string }

/** Barras horizontales sencillas (sin dependencias); la tabla vecina es la fuente verificable. */
export function BarrasSimples({ titulo, datos }: { titulo: string; datos: DatoBarra[] }) {
  if (datos.length === 0) return null;
  const max = Math.max(...datos.map((d) => d.valor));
  return (
    <figure style={{ margin: "14px 0 0" }}>
      <figcaption style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{titulo}</figcaption>
      <div role="img" aria-label={`${titulo}: ${datos.map((d) => `${d.etiqueta} ${cop(d.valor)}`).join("; ")}`} style={{ display: "grid", gap: 6 }}>
        {datos.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 190px) 1fr auto", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span className="largo" title={d.etiqueta} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.etiqueta}</span>
            <span style={{ background: "#EEF3F9", borderRadius: 4, height: 16, display: "block" }}>
              <span style={{ display: "block", height: 16, borderRadius: 4, width: `${Math.max(1.5, (d.valor / max) * 100)}%`, background: d.color ?? "#3A6EA5" }} />
            </span>
            <span className="cifra" style={{ fontWeight: 650, minWidth: 110, textAlign: "right" }}>{cop(d.valor)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
