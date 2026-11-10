"use client";
import { Table, Tag } from "antd";
import { CheckCircleOutlined, InfoCircleOutlined, QuestionCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { PENDIENTE, cop } from "@/lib/format";
import type { DetalleExpediente, ReferenciaPrecio, ResultadoPrecio } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";
import { BarrasPrecios } from "./barras-precios";
import { ConciliacionCifras } from "./conciliacion-cifras";

export const RESULTADO_ETQ: Record<ResultadoPrecio, string> = {
  SIN_CONTRATO_SOPORTADO: "Pendiente de soporte contractual",
  EVIDENCIA_INSUFICIENTE: "Evidencia insuficiente para contrastar con el mercado",
  ALCANCE_NO_EQUIVALENTE: "Alcance no equivalente: sin comparación",
  DENTRO_DEL_RANGO: "Dentro del rango de las referencias comparables",
  POR_ENCIMA_DEL_RANGO: "Por encima del rango de las referencias",
  POR_DEBAJO_DEL_RANGO: "Por debajo del rango de las referencias",
};

/** Un precio por encima del rango se muestra con la misma visibilidad que uno por debajo o dentro. */
export function ResultadoTag({ r }: { r: ResultadoPrecio }) {
  const fuera = r === "POR_ENCIMA_DEL_RANGO" || r === "POR_DEBAJO_DEL_RANGO";
  const Icono = r === "DENTRO_DEL_RANGO" ? CheckCircleOutlined : fuera ? WarningOutlined : QuestionCircleOutlined;
  const color = r === "DENTRO_DEL_RANGO" ? "success" : fuera ? "error" : "warning";
  return <Tag color={color} icon={<Icono />} style={{ whiteSpace: "normal", fontSize: 14, padding: "3px 10px" }}>{RESULTADO_ETQ[r]}</Tag>;
}

const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-CO")} %`);
const copDif = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${cop(n)}`);

export function AnalisisPreciosExpediente({ d }: { d: DetalleExpediente }) {
  const a = d.analisis_precios;
  const c = a.contratado;
  const contratadoBase = c.valor_inicial ?? c.valor_actualizado;
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section>
        <ResultadoTag r={a.resultado} />
        <p className="largo" style={{ margin: "10px 0 4px", maxWidth: 900 }}>{a.resumen}</p>
        <p className="texto-secundario" style={{ fontSize: 13.5, margin: 0 }}><InfoCircleOutlined /> Solo se afirma lo que los documentos permiten comprobar. No se aplican umbrales porcentuales para declarar sobrecostos.</p>
      </section>

      <section aria-labelledby="ap-contratado">
        <h2 id="ap-contratado" style={{ fontSize: 18, margin: "0 0 10px" }}>Qué se contrató y por cuánto</h2>
        {c.sustentado ? (
          <>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, margin: 0 }}>
              <div><dt className="texto-secundario" style={{ fontSize: 13 }}>Valor inicial</dt><dd className="cifra" style={{ margin: 0, fontWeight: 650, fontSize: 18 }}>{c.valor_inicial !== null ? cop(c.valor_inicial) : PENDIENTE}</dd></div>
              <div><dt className="texto-secundario" style={{ fontSize: 13 }}>Modificaciones</dt><dd className="cifra" style={{ margin: 0, fontWeight: 650, fontSize: 18 }}>{c.modificaciones !== null ? cop(c.modificaciones) : "Ninguna documentada"}</dd></div>
              <div><dt className="texto-secundario" style={{ fontSize: 13 }}>Valor actualizado</dt><dd className="cifra" style={{ margin: 0, fontWeight: 650, fontSize: 18 }}>{c.valor_actualizado !== null ? cop(c.valor_actualizado) : PENDIENTE}</dd></div>
            </dl>
            <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {c.detalle.map((x, i) => (
                <li key={i}>{x.tipo_acto}{x.numero ? ` ${x.numero}` : ""}: <span className="cifra">{cop(x.valor)}</span> <SoporteLink soporte={x.soporte} /></li>
              ))}
            </ul>
          </>
        ) : (
          <p style={{ border: `1px dashed ${PALETA.borde}`, borderRadius: 8, padding: 14, margin: 0, background: "#fff" }}>
            <strong style={{ color: PALETA.ambar }}>{PENDIENTE}.</strong> No hay contrato, acto de adjudicación ni acta que acredite el valor contratado. Un análisis del sector o una cotización no lo reemplazan.
          </p>
        )}
      </section>

      <section aria-labelledby="ap-ref">
        <h2 id="ap-ref" style={{ fontSize: 18, margin: "0 0 10px" }}>Referencias y diferencia frente a lo contratado</h2>
        {a.referencias.length === 0 ? (
          <p className="texto-secundario">No hay cotizaciones, presupuesto ni referencias registradas para este caso.</p>
        ) : (
          <Table<ReferenciaPrecio>
            size="middle"
            rowKey={(r) => `${r.tipo}-${r.etiqueta}-${r.valor}`}
            dataSource={a.referencias}
            pagination={false}
            scroll={{ x: 760 }}
            columns={[
              { title: "Referencia", key: "r", render: (_, r) => (
                <div className="largo" style={{ minWidth: 200 }}>
                  <strong>{r.etiqueta}</strong> {r.es_la_seleccionada && <Tag color="processing">Seleccionada</Tag>}
                  <div className="texto-secundario" style={{ fontSize: 13 }}>{r.independiente ? "Referencia independiente" : "Comparación presupuestal (no es referencia de mercado)"}</div>
                  {r.motivo && <div className="texto-secundario" style={{ fontSize: 13 }}>{r.motivo}</div>}
                </div>) },
              { title: "Valor", key: "v", align: "right", render: (_, r) => <span className="cifra">{r.valor !== null ? cop(r.valor) : PENDIENTE}</span> },
              { title: "Diferencia (COP)", key: "d", align: "right", render: (_, r) => <span className="cifra">{r.comparable ? copDif(r.diferencia_cop) : <span className="texto-secundario" style={{ fontSize: 13 }}>{contratadoBase === null ? "Pendiente de soporte contractual" : "—"}</span>}</span> },
              { title: "Diferencia (%)", key: "p", align: "right", render: (_, r) => <span className="cifra">{r.comparable ? pct(r.diferencia_pct) : "—"}</span> },
              { title: "Base de comparación", key: "b", render: (_, r) => (r.comparable && r.base !== null && contratadoBase !== null ? <span className="cifra">{cop(r.base)}</span> : <span className="texto-secundario">No comparable</span>) },
              { title: "Soporte", key: "s", render: (_, r) => <SoporteLink soporte={r.soporte} corto /> },
            ]}
          />
        )}
        {a.rango && <p style={{ marginTop: 12 }}>Rango de las {a.rango.referencias} referencias independientes y comparables: <strong className="cifra">{cop(a.rango.min)}</strong> a <strong className="cifra">{cop(a.rango.max)}</strong>.</p>}
        <p className="texto-secundario" style={{ fontSize: 13.5, margin: "6px 0 0" }}>
          Cobertura de la comparación: {a.cobertura.partidas_comparadas} de {a.cobertura.partidas_totales} partidas.{a.cobertura.aviso ? ` ${a.cobertura.aviso}` : ""}
        </p>
        {a.ejecutado_vs_contratado && (
          <p className="texto-secundario" style={{ fontSize: 13.5, margin: "6px 0 0" }}>
            Ejecutado respaldado: <span className="cifra">{cop(a.ejecutado_vs_contratado.ejecutado)}</span> ({copDif(a.ejecutado_vs_contratado.diferencia_cop)} frente a lo contratado). {a.ejecutado_vs_contratado.nota}
          </p>
        )}
      </section>

      <ConciliacionCifras d={d} />

      <BarrasPrecios d={d} />

      <section aria-labelledby="ap-falta">
        <h2 id="ap-falta" style={{ fontSize: 18, margin: "0 0 10px" }}>Qué falta para concluir</h2>
        {a.pendientes.length === 0 ? <p className="texto-secundario">No hay documentos pendientes identificados.</p> : <ul style={{ margin: 0, paddingLeft: 20 }}>{a.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>}
      </section>
    </div>
  );
}
