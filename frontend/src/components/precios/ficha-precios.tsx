"use client";
import type { ReactNode } from "react";
import { Collapse, Table, Tag } from "antd";
import Link from "next/link";
import { cop, fechaCorta } from "@/lib/format";
import { urlVisor } from "@/components/soporte-link";
import { EtiquetaInformativa } from "@/components/estado-informativo";
import type { FichaPrecios, FilaPrecios, FuenteDato, OfertaEdificio } from "@/types/contratacion";
import { BarrasSimples } from "./barras-simples";
import { ETQ_PROCEDENCIA, m2, Procedencia, VerFuente } from "./comunes";

const caja: React.CSSProperties = { background: "#fff", border: "1px solid #D5DBE5", borderRadius: 10, padding: "14px 16px", minWidth: 0 };

function Dato({ etiqueta, valor, detalle, fuente }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; fuente?: FuenteDato | null }) {
  return (
    <div style={caja}>
      <div className="texto-secundario" style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</div>
      <div className="cifra" style={{ fontSize: 24, fontWeight: 700, color: "#1B3A6B", margin: "4px 0 2px", overflowWrap: "anywhere" }}>{valor}</div>
      <div className="texto-secundario" style={{ fontSize: 13 }}>{detalle}</div>
      {fuente ? <div style={{ marginTop: 4 }}><VerFuente fuente={fuente} /></div> : null}
    </div>
  );
}

/** Los cuatro datos que responden lo esencial: valor, área, valor por m² y responsable (cada uno con su procedencia y su fuente). */
export function DatosClave({ f }: { f: FilaPrecios }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
      <Dato
        etiqueta={f.valor?.procedencia === "CONTRATO" ? "Valor contratado" : "Valor reportado"}
        valor={f.valor ? cop(f.valor.valor) : f.contrato_conjunto ? "Contrato conjunto" : "Por documentar"}
        detalle={f.valor ? <><Procedencia p={f.valor.procedencia} /> <span>{f.valor.etiqueta}</span></> : f.contrato_conjunto ? `${cop(f.contrato_conjunto.valor)} · ${f.contrato_conjunto.edificios} edificaciones` : undefined}
        fuente={f.valor?.fuente ?? f.contrato_conjunto?.soporte}
      />
      <Dato etiqueta="Área" valor={f.area ? m2(f.area.valor) : "Por precisar"} detalle={f.area ? f.area.etiqueta : "Aún no hay un área documentada ni reportada"} fuente={f.area?.fuente} />
      <Dato
        etiqueta={f.valor_m2?.clase === "CONTRATADO" ? "Valor contratado por m²" : "Valor por m²"}
        valor={f.valor_m2 ? cop(f.valor_m2.valor) : "Por precisar"}
        detalle={f.valor_m2 ? (f.valor_m2.clase === "REPORTADO" ? "Indicador reportado (consolidado)" : "Contrato ÷ área documentada") : undefined}
        fuente={f.valor_m2?.fuente}
      />
      <Dato etiqueta="Responsable" valor={<span style={{ fontSize: 20 }}>{f.responsable?.nombre ?? "Por identificar"}</span>} detalle={f.responsable?.etiqueta} fuente={f.responsable?.fuente} />
    </div>
  );
}

const fechaOferta = (iso: string | null) => (iso ? fechaCorta(iso) : null);

function TablaOferta({ o }: { o: OfertaEdificio }) {
  const c = o.componentes;
  const comp = ([["Costo directo", c.costo_directo, "costo_directo"], ["Administración", c.administracion, "administracion"], ["Imprevistos", c.imprevistos, "imprevistos"], ["Utilidad", c.utilidad, "utilidad"], ["IVA", c.iva, "iva"], ["Total de la oferta", c.total, "total"]] as const)
    .filter(([, v]) => v !== null).map(([etq, v, k]) => ({ k, etq, valor: v as number, fuente: o.fuentes_componentes[k] }));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="texto-secundario" style={{ margin: 0, fontSize: 13 }}>
        {o.relacion}.{o.alcance ? ` ${o.alcance}.` : ""}{o.oferta_conjunta ? ` Oferta conjunta de ${o.oferta_conjunta.edificios} edificios${o.oferta_conjunta.total ? `: total de la oferta ${cop(o.oferta_conjunta.total)} (no es el valor de este edificio)` : ""}.` : ""}
      </p>
      {o.items.length > 0 && (
        <Table
          size="small" pagination={false} rowKey={(_, i) => String(i)} dataSource={o.items} scroll={{ x: 640 }}
          columns={[
            { title: "Actividad", dataIndex: "actividad", render: (t: string) => <span className="largo">{t}</span> },
            { title: "Unidad", dataIndex: "unidad", width: 90 },
            { title: "Cantidad", dataIndex: "cantidad", align: "right", width: 90, render: (v: number | null) => (v === null ? "" : v.toLocaleString("es-CO", { maximumFractionDigits: 2 })) },
            { title: "Precio unitario", dataIndex: "precio_unitario", align: "right", width: 130, render: (v: number | null) => (v === null ? "" : <span className="cifra">{cop(v)}</span>) },
            { title: "Subtotal", dataIndex: "subtotal", align: "right", width: 140, render: (v: number | null) => (v === null ? "" : <span className="cifra">{cop(v)}</span>) },
            { title: "Fuente", dataIndex: "fuente", width: 130, render: (fu) => <VerFuente fuente={fu} texto="Ver" /> },
          ]}
        />
      )}
      {comp.length > 0 && (
        <Table
          size="small" pagination={false} rowKey="k" dataSource={comp} scroll={{ x: 480 }}
          columns={[
            { title: "Componente (con la base de cálculo de cada fuente)", dataIndex: "etq" },
            { title: "Valor", dataIndex: "valor", align: "right", width: 150, render: (v: number) => <span className="cifra" style={{ fontWeight: 600 }}>{cop(v)}</span> },
            { title: "Fuente", dataIndex: "fuente", width: 130, render: (fu) => <VerFuente fuente={fu} texto="Ver" /> },
          ]}
        />
      )}
      {o.controles.length > 0 && (
        <ul className="texto-secundario" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
          {o.controles.map((k, i) => (
            <li key={i}>{k.control}: {k.estado === "CUADRA" ? "cuadra" : Math.abs(k.diferencia) < 1 ? `Diferencia aritmética de ${cop(Math.abs(k.diferencia))} entre las cifras documentadas` : `no cuadra (diferencia ${cop(k.diferencia)})`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const h2 = { fontSize: 19, margin: "0 0 10px", color: "#1B3A6B" } as const;

/** Ficha ejecutiva de un edificio: cuatro datos y, luego, A. Desglose, B. Comparación y C. Documentos de respaldo. Lo técnico queda en desplegables. */
export function FichaPreciosEdificio({ ficha, tecnico, tecnicoEtiqueta }: { ficha: FichaPrecios; tecnico?: ReactNode; tecnicoEtiqueta?: string }) {
  const f = ficha.fila;
  const conItems = f.ofertas.filter((o) => o.items.length || o.componentes.costo_directo || o.componentes.total);
  const actividades = conItems.flatMap((o) => o.items.filter((i) => i.subtotal).map((i) => ({ etiqueta: `${o.empresa}: ${i.actividad}`.slice(0, 70), valor: i.subtotal as number })));
  const respaldo: { dato: string; fuente: FuenteDato | null }[] = [];
  if (f.valor) respaldo.push({ dato: `Valor (${f.valor.etiqueta})`, fuente: f.valor.fuente });
  if (f.area) respaldo.push({ dato: `Área (${f.area.clase === "DOCUMENTADA" ? "documentada" : "reportada"})`, fuente: f.area.fuente });
  if (f.valor_m2) respaldo.push({ dato: "Valor por m²", fuente: f.valor_m2.fuente });
  if (f.responsable) respaldo.push({ dato: `Responsable (${f.responsable.etiqueta})`, fuente: f.responsable.fuente });
  if (f.contrato_conjunto) respaldo.push({ dato: "Contrato conjunto", fuente: f.contrato_conjunto.soporte });
  for (const v of f.valores_alternos) respaldo.push({ dato: `Otra cifra: ${v.etiqueta}`, fuente: v.fuente });

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <DatosClave f={f} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <strong style={{ marginRight: 4 }}>{f.estado.etiqueta}</strong>
        {f.mensajes.map((m) => <EtiquetaInformativa key={m}>{m}</EtiquetaInformativa>)}
      </div>
      {f.contrato_conjunto && <p className="texto-secundario" style={{ margin: "-14px 0 0", fontSize: 13.5 }}>{f.contrato_conjunto.nota}</p>}
      {f.diferencias.length > 0 && (
        <Collapse size="small" items={[{ key: "d", label: `Diferencias entre fuentes (${f.diferencias.length})`, children: <ul style={{ margin: 0, paddingLeft: 18 }}>{f.diferencias.map((d, i) => <li key={i}>{d}</li>)}</ul> }]} />
      )}

      <section aria-labelledby="sec-a">
        <h2 id="sec-a" style={h2}>A. Desglose de precios</h2>
        {conItems.length === 0 ? (
          <p className="texto-secundario" style={{ margin: 0 }}>Aún no hay una oferta con desglose documentado para este edificio.</p>
        ) : (
          <Collapse
            defaultActiveKey={[`${0}`]}
            items={conItems.map((o, i) => ({
              key: `${i}`,
              label: <span><strong>{o.empresa}</strong> <span className="texto-secundario">· {o.documento}{o.referencia ? ` · ${o.referencia}` : ""}{fechaOferta(o.fecha) ? ` · ${fechaOferta(o.fecha)}` : ""}</span>{o.secuencia && <Tag style={{ marginLeft: 8 }}>{o.secuencia === "ANTERIOR" ? "Anterior" : "Posterior"}</Tag>}</span>,
              children: <>{o.nota_version && <p className="texto-secundario" style={{ margin: "0 0 8px", fontSize: 13.5 }}>{o.nota_version}</p>}<TablaOferta o={o} /></>,
            }))}
          />
        )}
        <BarrasSimples titulo="Composición del costo por actividad" datos={actividades.slice(0, 12)} />
      </section>

      <section aria-labelledby="sec-b">
        <h2 id="sec-b" style={h2}>B. Comparación</h2>
        <p className="texto-secundario" style={{ margin: "0 0 8px", fontSize: 13.5 }}>{f.comparacion.nota}</p>
        {f.comparacion.niveles.map((n) => (
          <div key={n.nivel} style={{ marginBottom: 14 }}>
            <Table
              size="small" pagination={false} rowKey={(r) => `${r.etiqueta}-${r.valor}`} dataSource={n.ofertas} scroll={{ x: 420 }}
              columns={[
                { title: n.etiqueta, dataIndex: "etiqueta", render: (t: string, r) => <span>{t}{r.secuencia && <Tag style={{ marginLeft: 8 }}>{r.secuencia === "ANTERIOR" ? "Anterior" : "Posterior"}</Tag>}</span> },
                { title: "Valor", dataIndex: "valor", align: "right", width: 150, render: (v: number) => <span className="cifra" style={{ fontWeight: 600 }}>{cop(v)}</span> },
                { title: "Fecha", dataIndex: "fecha", width: 110, render: (v: string | null) => fechaOferta(v) ?? "" },
                { title: "Fuente", dataIndex: "fuente", width: 130, render: (fu) => <VerFuente fuente={fu} texto="Ver" /> },
              ]}
            />
            <BarrasSimples titulo={`${n.etiqueta} por empresa`} datos={n.ofertas.map((o) => ({ etiqueta: o.etiqueta, valor: o.valor }))} />
          </div>
        ))}
        {f.etapas.length > 0 && (
          <div>
            <h3 style={{ fontSize: 15, margin: "10px 0 6px" }}>Valores por etapa</h3>
            <Table
              size="small" pagination={false} rowKey={(r) => `${r.etapa}-${r.valor}`} dataSource={f.etapas} scroll={{ x: 520 }}
              columns={[
                { title: "Etapa", dataIndex: "etapa" },
                { title: "Procedencia", dataIndex: "procedencia", width: 130, render: (p) => <Procedencia p={p} /> },
                { title: "Valor", dataIndex: "valor", align: "right", width: 150, render: (v: number) => <span className="cifra">{cop(v)}</span> },
                { title: "Fuente", dataIndex: "fuente", width: 130, render: (fu) => <VerFuente fuente={fu} texto="Ver" /> },
              ]}
            />
            {f.etapas_comparables
              ? <BarrasSimples titulo="Evolución de valores por etapa" datos={f.etapas.map((e) => ({ etiqueta: e.etapa, valor: e.valor }))} />
              : f.etapas.length > 1 && <p className="texto-secundario" style={{ fontSize: 13, margin: "6px 0 0" }}>Las cifras de cada etapa no declaran el mismo nivel (costo directo o total con AIU e IVA); por eso no se grafican juntas.</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="sec-c">
        <h2 id="sec-c" style={h2}>C. Documentos de respaldo</h2>
        <Table
          size="small" pagination={false} rowKey={(r, i) => `${r.dato}-${i}`} dataSource={respaldo} scroll={{ x: 520 }} locale={{ emptyText: "Sin documento de respaldo identificado" }}
          columns={[{ title: "Dato", dataIndex: "dato" }, { title: "Documento y ubicación", dataIndex: "fuente", render: (fu) => (fu ? <span className="largo"><span className="texto-secundario" style={{ fontSize: 12.5 }}>{fu.documento}</span> <VerFuente fuente={fu} /></span> : "—") }]}
        />
        {ficha.documentos.length > 0 && (
          <Collapse style={{ marginTop: 12 }} size="small" items={[{
            key: "docs", label: `Documentos del edificio (${ficha.documentos.length})`,
            children: (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {ficha.documentos.map((d, i) => (
                  <li key={i} className="largo"><span className="texto-secundario">{d.grupo} · </span>{d.version_id ? <Link href={urlVisor(d.version_id)}>{d.nombre}</Link> : d.nombre}</li>
                ))}
              </ul>
            ),
          }]} />
        )}
      </section>

      {tecnico && (
        <Collapse size="small" items={[{ key: "t", label: tecnicoEtiqueta ?? "Detalles técnicos, extracción y revisión", children: <div style={{ display: "grid", gap: 16 }}>{tecnico}</div> }]} />
      )}
    </div>
  );
}

export { ETQ_PROCEDENCIA };
