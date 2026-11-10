"use client";
import { LinkOutlined } from "@ant-design/icons";
import { cop } from "@/lib/format";
import type { DetalleExpediente, FilaMatriz } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";

function Dato({ etq, children }: { etq: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="texto-secundario" style={{ fontSize: 12.5, fontWeight: 600 }}>{etq}</div>
      <div className="largo" style={{ fontSize: 14.5 }}>{children}</div>
    </div>
  );
}

function Fila({ f }: { f: FilaMatriz }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px 20px", marginTop: 12 }}>
      <Dato etq="Número de proceso (como está escrito)"><span className="cifra">{f.proceso_original ?? "—"}</span><br /><SoporteLink soporte={f.soporte_proceso} corto /></Dato>
      <Dato etq="Número de contrato (como está escrito)"><span className="cifra">{f.contrato_original ?? "—"}</span><br /><SoporteLink soporte={f.soporte_contrato} corto /></Dato>
      <Dato etq="Alcance">{f.alcance_nombre}{f.contratista ? ` · ${f.contratista}` : ""}</Dato>
      {f.secop && (
        <Dato etq="Enlace a SECOP II (sin verificar)">
          <a href={f.secop} target="_blank" rel="noopener noreferrer" style={{ color: PALETA.tinta, fontWeight: 600 }}><LinkOutlined aria-hidden /> Abrir en SECOP II</a>
          {f.soporte_enlace && <><br /><SoporteLink soporte={f.soporte_enlace} corto /></>}
        </Dato>
      )}
    </div>
  );
}

/**
 * Valor reportado en la matriz de contratación, con la celda que lo sustenta. Se muestra aparte del valor corroborado por el contrato
 * y del ejecutado respaldado por acta: son tres hechos distintos y ninguno sustituye a los otros.
 */
export function MatrizContrato({ d }: { d: DetalleExpediente }) {
  const m = d.matriz;
  if (!m || m.filas.length === 0) return null;
  const compras = m.filas.filter((f) => f.tipo_hoja === "COMPRAS");
  const rep = m.valor_reportado;
  const contratos = d.contratacion.contratos;
  const corroborado = contratos.length ? contratos.reduce((a, c) => a + c.valor, 0) : null;
  const ejecutados = d.ejecucion.valores.filter((v) => v.estado_soporte === "RESPALDADO");
  const oficial = d.comparacion.valores.find((v) => v.tipo === "PRESUPUESTO_OFICIAL")?.importes[0] ?? null;
  const igualAlOficial = rep && oficial && Math.abs(oficial.importe - rep.importe) < 0.5;
  return (
    <section aria-label="Matriz de contratación" style={{ marginTop: 16, background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: "16px 18px" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Matriz de contratación</h2>
      {rep ? (
        <div style={{ marginTop: 8 }}>
          <div className="texto-secundario" style={{ fontSize: 13.5, fontWeight: 600 }}>{rep.concepto}</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 14px" }}>
            <span className="cifra" style={{ fontSize: 24, fontWeight: 700 }}>{cop(rep.importe)}</span>
            <SoporteLink soporte={rep.soporte} />
          </div>
        </div>
      ) : (
        <p className="texto-secundario" style={{ margin: "8px 0 0" }}>La fila de la matriz no trae un valor legible.</p>
      )}
      {compras.map((f) => <Fila key={f.id} f={f} />)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 0, border: "1px solid #E6EAF0", borderRadius: 8, marginTop: 16 }}>
        <div style={{ padding: "12px 14px", borderRight: "1px solid #E6EAF0" }}>
          <div className="texto-secundario" style={{ fontSize: 12.5, fontWeight: 600 }}>Reportado en matriz</div>
          <div className="cifra" style={{ fontSize: 17, fontWeight: 650 }}>{rep ? cop(rep.importe) : "—"}</div>
          <SoporteLink soporte={rep?.soporte} corto />
        </div>
        <div style={{ padding: "12px 14px", borderRight: "1px solid #E6EAF0" }}>
          <div className="texto-secundario" style={{ fontSize: 12.5, fontWeight: 600 }}>Corroborado en contrato</div>
          {corroborado !== null ? (
            <>
              <div className="cifra" style={{ fontSize: 17, fontWeight: 650 }}>{cop(corroborado)}</div>
              {contratos.slice(0, 2).map((c) => <SoporteLink key={c.id} soporte={c.soporte} corto />)}
            </>
          ) : (
            <div style={{ color: PALETA.ambar, fontWeight: 650 }}>Pendiente: contrato suscrito no localizado</div>
          )}
        </div>
        <div style={{ padding: "12px 14px" }}>
          <div className="texto-secundario" style={{ fontSize: 12.5, fontWeight: 600 }}>Ejecutado respaldado por acta</div>
          {ejecutados.length ? (
            ejecutados.slice(0, 2).map((v) => <div key={v.id}><span className="cifra" style={{ fontSize: 17, fontWeight: 650 }}>{cop(v.importe)}</span> <SoporteLink soporte={v.soporte} corto /></div>)
          ) : (
            <div style={{ color: PALETA.ambar, fontWeight: 650 }}>Pendiente: faltan actas de ejecución</div>
          )}
        </div>
      </div>

      {rep?.coincide_con_contrato && <p className="texto-secundario" style={{ margin: "10px 0 0", fontSize: 13.5 }}>El importe de la matriz y el del contrato son el mismo: se cuenta una sola vez.</p>}
      {igualAlOficial && !rep?.coincide_con_contrato && (
        <p className="texto-secundario" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
          El importe de la matriz es igual al presupuesto oficial ({cop(oficial!.importe)}, <SoporteLink soporte={oficial!.soporte} corto />). Mientras no se localice el contrato suscrito, no acredita por sí solo el valor contratado.
        </p>
      )}
      {m.adiciones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="texto-secundario" style={{ fontSize: 13, fontWeight: 600 }}>Adiciones registradas en la matriz (modifican este contrato)</div>
          {m.adiciones.map((a) => (
            <div key={a.id}><span className="cifra">{a.valor !== null ? cop(a.valor) : "—"}</span> <SoporteLink soporte={a.soporte_valor} corto /></div>
          ))}
        </div>
      )}
    </section>
  );
}
