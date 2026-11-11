"use client";
import type { LecturaAsistida as Lectura } from "@/types/contratacion";
import { cop } from "@/lib/format";

const ETQ: Record<string, string> = {
  proceso: "Proceso", contrato: "Contrato", contratista: "Contratista", importe: "Importe", edificio: "Edificio", intervencion: "Intervención", etapa: "Etapa",
};

/** Datos extraídos por la lectura asistida: cada uno con su página y su cita. Son pendientes de verificación y no entran en los totales. */
export function LecturaAsistida({ lectura }: { lectura: Lectura[] | undefined }) {
  const l = lectura ?? [];
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
          {(x.partidas ?? []).length > 0 && (
            <table style={{ marginTop: 8, borderCollapse: 'collapse', fontSize: 13.5, width: '100%' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600 }}>Importes por edificio o alcance (por verificar)</caption>
              <thead><tr><th style={{ textAlign: 'left' }}>Edificio</th><th style={{ textAlign: 'left' }}>Alcance</th><th style={{ textAlign: 'right' }}>Importe</th><th style={{ textAlign: 'left' }}>Fuente</th><th style={{ textAlign: 'left' }}>Edificio registrado</th><th style={{ textAlign: 'left' }}>Relación</th></tr></thead>
              <tbody>
                {x.partidas!.map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #E6EAF0' }}>
                    <td>{p.edificio ?? 'Sin edificio inequívoco'}</td><td>{p.alcance}</td><td style={{ textAlign: 'right' }} className="cifra">{cop(p.importe)}{p.unidad !== 'GLOBAL' ? ` / ${p.unidad}` : ''}</td>
                    <td>p. {p.pagina}</td>
                    <td>{!p.coincidencia ? '—' : p.coincidencia.estado === 'SIN_COINCIDENCIA' ? 'Sin edificio registrado con ese nombre' : `${p.coincidencia.estado === 'COINCIDE' ? 'Igual a' : 'Parecido a'} ${p.coincidencia.edificio}${p.coincidencia.vinculado_al_documento ? ' (vinculado al documento)' : ' (no vinculado al documento)'}`}</td>
                    <td>{p.relacion === 'EXPLICITA' ? 'Explícita en la cita' : 'Pendiente de revisión'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(x.edificios_sin_vinculo ?? []).length > 0 && (
            <p className="texto-secundario" style={{ margin: '6px 0 0', fontSize: 13 }}>
              La tabla cita {x.edificios_en_tabla} edificios y el documento tiene {x.edificios_vinculados_al_documento} vinculados. Sin vínculo confirmado: {x.edificios_sin_vinculo!.join('; ')}. Las relaciones siguen pendientes de revisión.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
