"use client";
import type { DetalleExpediente } from "@/types/contratacion";
import { cop } from "@/lib/format";

const ETQ: Record<string, string> = {
  proceso: "Proceso", contrato: "Contrato", contratista: "Contratista", importe: "Importe", edificio: "Edificio", intervencion: "Intervención", etapa: "Etapa",
};

/** Datos extraídos por la lectura asistida: cada uno con su página y su cita. Son pendientes de verificación y no entran en los totales. */
export function LecturaAsistida({ d }: { d: DetalleExpediente }) {
  const l = d.lectura_asistida ?? [];
  if (l.length === 0) return null;
  return (
    <section aria-label="Datos extraídos pendientes de verificación" style={{ marginTop: 16, background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: "16px 18px" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Datos extraídos pendientes de verificación</h2>
      <p className="texto-secundario" style={{ margin: "4px 0 0", fontSize: 13.5 }}>Fuente: lectura asistida del documento. No entran en los totales hasta que se verifiquen.</p>
      {l.map((x) => (
        <div key={x.version_id} style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600 }}>{x.documento}</div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {x.campos.map((c) => (
              <li key={c.campo}>
                <strong>{ETQ[c.campo] ?? c.campo}:</strong> {c.campo === "importe" && typeof c.valor === "number" ? cop(c.valor) : String(c.valor)}{" "}
                <span className="texto-secundario">(p. {c.pagina}: «{c.cita}»)</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
