"use client";
import { useMemo, useState } from "react";
import { Alert, Button, Table, Tag } from "antd";
import { CalculatorOutlined, FileTextOutlined, LineChartOutlined } from "@ant-design/icons";
import { PENDIENTE, UNIDAD_ETQ, cop, fechaCorta, precioConUnidad } from "@/lib/format";
import { ETAPA_ETQ, desglose, encabezadoM2, historial, type EntradaPrecio, type Partida, type PrecioM2 } from "@/lib/precios-actividad";
import type { DetalleExpediente } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";
import { FirmaContrato } from "./firma-contrato";

const num = (n: number | null, dec = 2) => (n === null ? "—" : n.toLocaleString("es-CO", { maximumFractionDigits: dec }));
const unidadEtq = (u: string | null) => (u === null ? "—" : u === "GLOBAL" ? "global" : UNIDAD_ETQ[u] ?? u);
const COLOR_ETAPA: Record<string, string> = { COTIZADO: "blue", PRESUPUESTADO: "gold", CONTRATADO: "green", EJECUTADO: "purple" };

function Origen({ p }: { p: PrecioM2 }) {
  return (
    <Tag icon={p.origen === "CALCULADO" ? <CalculatorOutlined /> : <FileTextOutlined />} color={p.origen === "CALCULADO" ? "processing" : "success"} style={{ whiteSpace: "normal" }}>
      {p.origen === "CALCULADO" ? "Calculado: importe ÷ área" : "Del documento"}
    </Tag>
  );
}

function CifraM2({ p, area }: { p: PrecioM2 | null; area: number | null }) {
  if (!p || p.valor === null) return <div style={{ color: PALETA.ambar, fontWeight: 650 }}>{area === null ? "Área pendiente" : PENDIENTE}</div>;
  return (
    <>
      <div className="importe cifra">{cop(p.valor)}<span style={{ fontSize: 15, fontWeight: 500 }}> /m²</span></div>
      <Origen p={p} />
      <div className="texto-secundario" style={{ fontSize: 13, marginTop: 4 }}>
        {cop(p.importe)} ÷ {num(area)} m²
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><SoporteLink soporte={p.importeSoporte} corto /></div>
      </div>
    </>
  );
}

function EncabezadoM2({ d }: { d: DetalleExpediente }) {
  const h = encabezadoM2(d);
  if (!h.aplica) return <p className="texto-secundario" style={{ margin: 0 }}>{h.motivo}</p>;
  return (
    <div>
      <div className="grupo-valores grupo-3">
        <div>
          <div className="etq-valor">Área documentada</div>
          {h.area ? (
            <>
              <div className="importe cifra">{num(h.area.valor)} <span style={{ fontSize: 15, fontWeight: 500 }}>m²</span></div>
              <Tag color="success" icon={<FileTextOutlined />}>Del documento</Tag>
              <div style={{ marginTop: 4 }}><SoporteLink soporte={h.area.soporte} corto /></div>
              {h.area.distintas.length > 1 && <div className="texto-secundario" style={{ fontSize: 12.5 }}>Los capítulos indican {h.area.distintas.map((x) => num(x)).join(", ")} m²; cada uno conserva la suya.</div>}
            </>
          ) : (
            <div style={{ color: PALETA.ambar, fontWeight: 650, fontSize: 18 }}>Área pendiente</div>
          )}
        </div>
        <div>
          <div className="etq-valor">Costo directo por m²</div>
          <CifraM2 p={h.costoDirecto} area={h.area?.valor ?? null} />
        </div>
        <div>
          <div className="etq-valor">Presupuesto oficial por m² (con AIU e IVA)</div>
          <CifraM2 p={h.presupuesto} area={h.area?.valor ?? null} />
        </div>
      </div>
      {h.motivo && h.area && <p className="texto-secundario" style={{ margin: "8px 0 0" }}>{h.motivo}</p>}
    </div>
  );
}

function ContratosBloque({ d }: { d: DetalleExpediente }) {
  if (d.contratacion.contratos.length === 0) return null;
  const variosEdificios = d.edificios.length > 1;
  return (
    <section aria-label="Contratos" style={{ display: "grid", gap: 8 }}>
      {d.contratacion.contratos.map((c) => (
        <div key={c.id} style={{ border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 12, background: "#fff" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
            <strong className="largo">Contrato {c.numero} · {c.contratista ?? ""}</strong>
            <span className="cifra" style={{ fontWeight: 700, fontSize: 18 }}>{cop(c.valor)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}><SoporteLink soporte={c.soporte} /><FirmaContrato c={c} detalle={false} /></div>
          <Tag color="warning" style={{ marginTop: 8, whiteSpace: "normal" }}>Pendiente de anexo de precios unitarios</Tag>
          <span className="texto-secundario" style={{ fontSize: 13, marginLeft: 8 }}>
            Total contractual global.{variosEdificios ? " Un precio por m² exige valor y área atribuibles a cada edificio." : " Sin anexo no hay precio por actividad ni por m²."}
          </span>
        </div>
      ))}
    </section>
  );
}

function Variacion({ e }: { e: EntradaPrecio }) {
  if (e.esReferencia) return <Tag color="blue">Referencia</Tag>;
  if (e.difCop !== null) {
    return (
      <span className="cifra" style={{ color: e.difCop === 0 ? PALETA.texto : e.difCop > 0 ? PALETA.rojo : PALETA.petroleo, fontWeight: 650 }}>
        {e.difCop > 0 ? "+" : ""}{cop(e.difCop)}{e.difPct !== null && ` (${e.difPct > 0 ? "+" : ""}${num(e.difPct, 1)} %)`}
      </span>
    );
  }
  return <span className="texto-secundario" style={{ fontSize: 13 }}>No comparable: {e.motivo}</span>;
}

function Historial({ d, fila }: { d: DetalleExpediente; fila: Partida }) {
  const entradas = useMemo(() => historial(d, fila), [d, fila]);
  return (
    <section aria-live="polite" aria-label={`Cómo cambió el precio de ${fila.concepto}`} style={{ background: "#fff", border: `1px solid ${PALETA.tinta}`, borderRadius: 8, padding: 14 }}>
      <h3 className="largo" style={{ margin: "0 0 4px", fontSize: 17 }}>¿Cómo cambió el precio de «{fila.concepto}»?</h3>
      <p className="texto-secundario" style={{ margin: "0 0 10px", fontSize: 13.5 }}>
        Ordenado por fecha. La variación se calcula solo entre precios unitarios con la misma actividad, unidad y tratamiento de AIU e IVA; la referencia es la fila marcada.
      </p>
      <Table<EntradaPrecio>
        size="small"
        pagination={false}
        rowKey="clave"
        dataSource={entradas}
        scroll={{ x: 760 }}
        columns={[
          { title: "Fecha", key: "f", width: 105, render: (_, e) => (e.fecha ? fechaCorta(e.fecha) : <span className="texto-secundario">Fecha pendiente</span>) },
          { title: "Fuente", key: "s", render: (_, e) => <span className="largo">{e.fuente}</span> },
          { title: "Etapa", key: "e", render: (_, e) => <Tag color={COLOR_ETAPA[e.etapa]}>{ETAPA_ETQ[e.etapa]}</Tag> },
          { title: "Unidad", key: "u", render: (_, e) => unidadEtq(e.unidad) },
          { title: "Cantidad", key: "c", align: "right", render: (_, e) => <span className="cifra">{num(e.cantidad)}</span> },
          { title: "Precio unitario", key: "p", align: "right", render: (_, e) => <span className="cifra">{e.precio !== null ? cop(e.precio) : e.total !== null ? <span title="Valor global">{cop(e.total)} <span className="texto-secundario" style={{ fontSize: 12 }}>global</span></span> : "—"}</span> },
          { title: "Variación", key: "v", render: (_, e) => <Variacion e={e} /> },
          { title: "Soporte", key: "z", render: (_, e) => <SoporteLink soporte={e.soporte} corto /> },
        ]}
      />
    </section>
  );
}

/** Cuadro «Precio por m² y desglose por actividad»: primero el desglose por capítulo, luego el cambio de precio de la actividad elegida. */
export function PreciosPorActividad({ d }: { d: DetalleExpediente }) {
  const grupos = useMemo(() => desglose(d), [d]);
  const [sel, setSel] = useState<Partida | null>(null);
  const observacion = d.necesidad.pendientes_aclaracion.find((h) => /administraci/i.test(h.titulo));

  return (
    <section aria-labelledby="pxa" style={{ display: "grid", gap: 16 }}>
      <h2 id="pxa" style={{ fontSize: 20, margin: 0 }}><LineChartOutlined /> Precio por m² y desglose por actividad</h2>
      <EncabezadoM2 d={d} />
      <ContratosBloque d={d} />

      {grupos.length === 0 && (
        <Alert type="info" showIcon message="Sin partidas desglosadas" description="No hay una oferta con actividades, cantidades y precios unitarios para este expediente. Los valores globales se ven arriba; el desglose depende del anexo de precios o de la cotización detallada." />
      )}

      {grupos.map((g) => (
        <div key={`${g.proveedor}-${g.fechaOferta}`}>
          <h3 className="largo" style={{ fontSize: 16, margin: "0 0 6px" }}>
            Oferta de {g.proveedor} · {g.fechaOferta ? fechaCorta(g.fechaOferta) : "fecha pendiente"}
          </h3>
          <Table<Partida & { children?: Partida[] }>
            size="middle"
            rowKey="id"
            pagination={false}
            dataSource={g.filas.map((f) => ({ ...f, children: f.hijos.length ? f.hijos : undefined }))}
            expandable={{ defaultExpandAllRows: false, indentSize: 18 }}
            rowClassName={(r) => (sel?.id === r.id ? "fila-activa" : "")}
            onRow={(r) => ({ onClick: () => setSel(r), style: { cursor: "pointer" } })}
            columns={[
              {
                title: "Actividad",
                key: "c",
                render: (_, r) => (
                  <div className="largo" style={{ minWidth: 150 }}>
                    <Button type="link" style={{ padding: 0, height: "auto", whiteSpace: "normal", textAlign: "left", fontWeight: r.nivel === "capitulo" ? 650 : 500 }} onClick={(e) => { e.stopPropagation(); setSel(r); }} aria-label={`Ver cómo cambió el precio de ${r.concepto}`}>
                      {r.concepto}
                    </Button>
                    {r.nivel === "capitulo" && r.hijos.length > 0 && <div className="texto-secundario" style={{ fontSize: 12.5 }}>{r.hijos.length} partidas; el capítulo ya las incluye</div>}
                    {/* En móvil se conservan visibles concepto y precio unitario; el resto va en esta línea. */}
                    <div className="solo-movil texto-secundario" style={{ fontSize: 12.5 }}>
                      {num(r.cantidad)} {unidadEtq(r.unidad)} · total {r.total !== null ? cop(r.total) : "—"}
                      <div><SoporteLink soporte={r.soporte} corto /></div>
                    </div>
                  </div>
                ),
              },
              { title: "Unidad", key: "u", responsive: ["md"], render: (_, r) => unidadEtq(r.unidad) },
              { title: "Cantidad", key: "q", align: "right", responsive: ["md"], render: (_, r) => <span className="cifra">{num(r.cantidad)}</span> },
              { title: "Precio unitario", key: "p", align: "right", render: (_, r) => <span className="cifra" style={{ fontWeight: 650 }}>{r.precioUnitario !== null ? precioConUnidad(r.precioUnitario, r.unidad) : "—"}</span> },
              { title: "Valor total", key: "t", align: "right", responsive: ["md"], render: (_, r) => <span className="cifra">{r.total !== null ? cop(r.total) : "—"}</span> },
              { title: "Origen", key: "o", responsive: ["lg"], render: (_, r) => <Tag color={r.derivado ? "processing" : "success"}>{r.derivado ? "Calculado" : "Del documento"}</Tag> },
              { title: "Soporte", key: "s", responsive: ["md"], render: (_, r) => <SoporteLink soporte={r.soporte} corto /> },
            ]}
          />

          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 14 }}>Consolidado</strong>
            <Table
              size="small"
              pagination={false}
              rowKey="clave"
              dataSource={g.consolidado}
              showHeader={false}
              columns={[
                { key: "c", render: (_, r) => <span className="largo">{r.concepto}</span> },
                { key: "t", align: "right", render: (_, r) => <span className="cifra" style={{ fontWeight: 650 }}>{cop(r.total)}</span> },
                { key: "s", width: 130, render: (_, r) => <SoporteLink soporte={r.soporte} corto /> },
              ]}
            />
            <p className="texto-secundario" style={{ fontSize: 13, margin: "6px 0 0" }}>
              Cada capítulo se cuenta una sola vez: sus partidas explican el capítulo y no se suman aparte.
              {g.costoDirecto.suma !== null && <> Suma de los capítulos: <span className="cifra">{cop(g.costoDirecto.suma)}</span>{g.costoDirecto.reportado !== null && (g.costoDirecto.coincide ? " = costos directos reportados." : ` frente a ${cop(g.costoDirecto.reportado)} reportados: no coinciden.`)}</>}
            </p>
            {observacion && (
              <Alert style={{ marginTop: 8 }} type="warning" showIcon message={`Observación del documento: ${observacion.titulo}`} description={<>{observacion.detalle} <SoporteLink soporte={observacion.soporte} corto /></>} />
            )}
          </div>
        </div>
      ))}

      {sel ? <Historial d={d} fila={sel} /> : grupos.length > 0 && <p className="texto-secundario" style={{ margin: 0 }}>Elija una actividad para ver cómo cambió su precio entre fuentes.</p>}
    </section>
  );
}
