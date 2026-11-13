"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Drawer, Segmented, Select, Table, Tag } from "antd";
import { FileSearchOutlined, FileTextOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { BotonEnlace } from "@/components/boton-enlace";
import { cop, fechaCorta } from "@/lib/format";
import { etiquetaOferta, filasDesglose, type FilaDesglose } from "@/lib/ficha";
import { urlVisor } from "@/components/soporte-link";
import type { FichaPrecios, FilaComparacionEjecutiva, FilaPrecios, FuenteDato } from "@/types/contratacion";
import { BotonPdf, FuenteLink, m2 } from "./comunes";

const caja: React.CSSProperties = { background: "#fff", border: "1px solid #D5DBE5", borderRadius: 10, padding: "16px 20px", minWidth: 0 };
const h2: React.CSSProperties = { fontSize: 20, margin: "0 0 12px", color: "#1B3A6B", fontWeight: 650 };

function Dato({ etiqueta, valor, detalle, fuente }: { etiqueta: string; valor: ReactNode; detalle: ReactNode; fuente?: FuenteDato | null }) {
  return (
    <div style={caja}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#4A5568", textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</div>
      <div className="cifra" style={{ fontSize: 30, fontWeight: 700, color: "#1B3A6B", margin: "6px 0 4px", lineHeight: 1.15 }}>{valor}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline", fontSize: 14.5 }}>
        <span className="texto-secundario">{detalle}</span>
        {fuente ? <FuenteLink fuente={fuente} /> : null}
      </div>
    </div>
  );
}

/** Tres datos esenciales. La fuente de cada uno se abre con un clic; el nombre del archivo no se despliega aquí. */
function DatosClave({ f }: { f: FilaPrecios }) {
  const contratado = f.valor?.procedencia === "CONTRATO";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      <Dato
        etiqueta={contratado ? "Valor contratado" : "Valor reportado"}
        valor={f.valor ? cop(f.valor.valor) : f.contrato_conjunto ? "Contrato conjunto" : "Por documentar"}
        detalle={f.valor ? f.valor.etiqueta : f.contrato_conjunto ? `${cop(f.contrato_conjunto.valor)} · ${f.contrato_conjunto.edificios} edificios` : "Sin soporte aún"}
        fuente={f.valor?.fuente ?? f.contrato_conjunto?.soporte}
      />
      <Dato
        etiqueta="Área"
        valor={f.area ? m2(f.area.valor) : "Por precisar"}
        detalle={f.area ? (f.area.clase === "DOCUMENTADA" ? "Verificada en documentos" : `Reportada · ${f.area.etiqueta.charAt(0).toLowerCase()}${f.area.etiqueta.slice(1)}`) : "Sin fuente aún"}
        fuente={f.area?.fuente}
      />
      <Dato
        etiqueta={f.valor_m2?.clase === "CONTRATADO" ? "Valor contratado por m²" : "Valor por m²"}
        valor={f.valor_m2 ? cop(f.valor_m2.valor) : "Por precisar"}
        detalle={f.valor_m2 ? (f.valor_m2.clase === "REPORTADO" ? "Reportado en el consolidado" : "Contrato ÷ área verificada") : "Requiere valor y área"}
        fuente={f.valor_m2?.fuente}
      />
    </div>
  );
}

const Secuencia = ({ s }: { s: "ANTERIOR" | "POSTERIOR" | null }) => (s ? <Tag style={{ marginInlineStart: 8 }}>{s === "ANTERIOR" ? "Anterior" : "Posterior"}</Tag> : null);
const fecha = (iso: string | null) => (iso ? fechaCorta(iso) : "—");

/** A. Desglose del precio: una oferta a la vez (la de la empresa responsable cuando consta), con subpartidas plegadas y AIU e IVA una sola vez. */
function Desglose({ ficha }: { ficha: FichaPrecios }) {
  const f = ficha.fila;
  const x = f.ejecutivo;
  const conDesglose = useMemo(() => f.ofertas.map((o, i) => ({ o, i })).filter(({ o }) => o.items.length > 0 || Object.values(o.componentes).some((v) => v !== null)), [f.ofertas]);
  const [elegida, setElegida] = useState<number | null>(null);
  const indice = elegida ?? x.desglose_indice;
  const o = indice !== null ? f.ofertas[indice] : null;
  if (!o) return <p className="texto-secundario" style={{ margin: 0, fontSize: 15.5 }}>Aún no hay un desglose documentado para este edificio.</p>;
  const filas = filasDesglose(o);
  const nota = [o.nota_version, o.oferta_conjunta ? `Oferta conjunta de ${o.oferta_conjunta.edificios} edificios: se muestran solo las filas de este edificio.` : null].filter(Boolean).join(". ");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        {conDesglose.length <= 1 && <div style={{ fontSize: 16, fontWeight: 600 }}>{etiquetaOferta(o, (iso) => fechaCorta(iso))}</div>}
        {conDesglose.length > 1 && (
          <Select
            style={{ minWidth: 280, maxWidth: "100%" }} aria-label="Oferta cuyo desglose se muestra" value={indice ?? undefined} onChange={setElegida}
            options={conDesglose.map(({ o: x2, i }) => ({ value: i, label: etiquetaOferta(x2, (iso) => fechaCorta(iso)) }))}
          />
        )}
      </div>
      {nota && <p className="texto-secundario" style={{ margin: 0, fontSize: 14.5 }}>{nota}</p>}
      <Table<FilaDesglose>
        size="middle" pagination={false} rowKey="key" dataSource={filas} scroll={{ x: 640 }}
        expandable={{ childrenColumnName: "children", indentSize: 18 }}
        rowClassName={(r) => (r.tipo === "total" ? "fila-total" : "")}
        columns={[
          { title: "Actividad", dataIndex: "actividad", render: (t: string, r) => <span className="largo" style={{ fontWeight: r.tipo === "actividad" ? 500 : 600 }}>{t}</span> },
          { title: "Cantidad / unidad", dataIndex: "cantidad", width: 150, render: (t: string) => <span className="cifra">{t}</span> },
          { title: "Precio unitario", dataIndex: "unitario", width: 170, align: "right", render: (v: number | null) => (v === null ? "" : <span className="cifra">{cop(v)}</span>) },
          { title: "Importe", dataIndex: "importe", width: 170, align: "right", render: (v: number | null, r) => (v === null ? "" : <span className="cifra" style={{ fontWeight: r.tipo === "total" ? 700 : 600 }}>{cop(v)}</span>) },
        ]}
      />
    </div>
  );
}

/** B. Comparación de ofertas: cada valor es una referencia separada con su base y alcance; nunca un porcentaje. */
function Comparacion({ ficha }: { ficha: FichaPrecios }) {
  const x = ficha.fila.ejecutivo;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {x.comparacion.length > 0 && (
        <Table<FilaComparacionEjecutiva>
          size="middle" pagination={false} rowKey={(r) => `${r.indice}`} dataSource={x.comparacion} scroll={{ x: 760 }}
          columns={[
            { title: "Empresa", key: "e", width: 230, render: (_, r) => (
              <div><span style={{ fontWeight: 650 }}>{r.empresa}</span><Secuencia s={r.secuencia} />{r.referencia && <div className="texto-secundario" style={{ fontSize: 14 }}>{r.referencia}</div>}</div>
            ) },
            { title: "Fecha", key: "f", width: 120, render: (_, r) => <span className="cifra">{fecha(r.fecha)}</span> },
            { title: "Alcance resumido", dataIndex: "alcance", render: (t: string) => <span className="largo">{t}</span> },
            { title: "Valor", key: "v", align: "right", width: 190, render: (_, r) => (
              <div style={{ display: "grid", justifyItems: "end" }}><span className="cifra" style={{ fontWeight: 700 }}>{cop(r.valor)}</span><span className="texto-secundario" style={{ fontSize: 13.5 }}>{r.base}</span></div>
            ) },
            { title: "", key: "o", width: 120, render: (_, r) => <FuenteLink fuente={r.fuente} texto="Ver oferta" /> },
          ]}
        />
      )}
      <p className="texto-secundario" style={{ margin: 0, fontSize: 14.5 }}>{x.nota_comparacion}</p>
    </div>
  );
}

type Panel = "fuentes" | "documentos" | "calculo";

/** Panel lateral: otras fuentes, documentos relacionados y detalle de cálculo (lo que antes saturaba la ficha). */
function PanelLateral({ ficha, abierto, panel, cambiar, cerrar }: { ficha: FichaPrecios; abierto: boolean; panel: Panel; cambiar: (p: Panel) => void; cerrar: () => void }) {
  const f = ficha.fila;
  const x = f.ejecutivo;
  const fuentes: Array<{ dato: string; valor: string | null; nota: string | null; fuente: FuenteDato | null | undefined }> = [];
  if (f.valor) fuentes.push({ dato: `Valor principal · ${f.valor.etiqueta}`, valor: cop(f.valor.valor), nota: f.valor.nota, fuente: f.valor.fuente });
  for (const v of f.valores_alternos) fuentes.push({ dato: `Otra fuente · ${v.etiqueta}`, valor: cop(v.valor), nota: v.nota, fuente: v.fuente });
  if (f.contrato_conjunto) fuentes.push({ dato: `Contrato conjunto · ${f.contrato_conjunto.proceso}`, valor: cop(f.contrato_conjunto.valor), nota: f.contrato_conjunto.nota, fuente: f.contrato_conjunto.soporte });
  if (f.area) fuentes.push({ dato: `Área · ${f.area.clase === "DOCUMENTADA" ? "verificada" : "reportada"}`, valor: m2(f.area.valor), nota: null, fuente: f.area.fuente });
  if (f.valor_m2) fuentes.push({ dato: `Valor por m² · ${f.valor_m2.clase === "REPORTADO" ? "reportado" : "contratado"}`, valor: cop(f.valor_m2.valor), nota: f.valor_m2.nota, fuente: f.valor_m2.fuente });
  if (f.responsable) fuentes.push({ dato: "Responsable", valor: f.responsable.nombre, nota: f.responsable.etiqueta, fuente: f.responsable.fuente });
  const controles = f.ofertas.filter((o) => o.controles.length > 0);
  const grupos = [...new Set(ficha.documentos.map((d) => d.grupo))];
  return (
    <Drawer open={abierto} onClose={cerrar} width={560} title="Fuentes y documentos" destroyOnHidden>
      <div style={{ display: "grid", gap: 16 }}>
        <Segmented<Panel> block value={panel} onChange={cambiar} options={[{ label: "Fuentes", value: "fuentes" }, { label: `Documentos (${ficha.documentos.length})`, value: "documentos" }, { label: "Cálculo", value: "calculo" }]} />
        {panel === "fuentes" && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {fuentes.length === 0 && <li className="texto-secundario">Sin fuentes registradas todavía.</li>}
            {fuentes.map((r, i) => (
              <li key={i} style={{ borderBottom: "1px solid #E6EAF0", paddingBottom: 10 }}>
                <div className="texto-secundario" style={{ fontSize: 14 }}>{r.dato}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span className="cifra" style={{ fontWeight: 650, fontSize: 16 }}>{r.valor}</span>
                  <FuenteLink fuente={r.fuente} />
                </div>
                {r.nota && <div className="texto-secundario" style={{ fontSize: 14 }}>{r.nota}</div>}
              </li>
            ))}
          </ul>
        )}
        {panel === "documentos" && (
          <div style={{ display: "grid", gap: 14 }}>
            {ficha.documentos.length === 0 && <span className="texto-secundario">No hay documentos relacionados todavía.</span>}
            {grupos.map((g) => (
              <section key={g}>
                <h3 style={{ fontSize: 15, margin: "0 0 6px", color: "#1B3A6B" }}>{g}</h3>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {ficha.documentos.filter((d) => d.grupo === g).map((d, i) => (
                    <li key={i} className="largo">{d.version_id ? <Link href={urlVisor(d.version_id)}>{d.nombre}</Link> : d.nombre} <span className="texto-secundario" style={{ fontSize: 13 }}>{d.formato}</span></li>
                  ))}
                </ul>
              </section>
            ))}
            {f.edificio_id !== null && <Link href={`/documentos/trazabilidad/edificio/${f.edificio_id}`} style={{ fontWeight: 600 }}><FolderOpenOutlined aria-hidden /> Trazabilidad y gestión de este edificio</Link>}
          </div>
        )}
        {panel === "calculo" && (
          <div style={{ display: "grid", gap: 14, fontSize: 15 }}>
            {x.diferencias_calculo.length === 0 && controles.length === 0 && !f.valor_m2?.nota && <span className="texto-secundario">No hay diferencias ni controles que informar.</span>}
            {x.diferencias_calculo.length > 0 && <section><h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Diferencias menores entre fuentes</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{x.diferencias_calculo.map((t, i) => <li key={i}>{t}</li>)}</ul></section>}
            {f.valor_m2?.nota && <section><h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Valor por m²</h3><p style={{ margin: 0 }}>{f.valor_m2.nota}</p></section>}
            {controles.map((o, i) => (
              <section key={i}>
                <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Controles aritméticos · {etiquetaOferta(o, (iso) => fechaCorta(iso))}</h3>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {o.controles.map((k, j) => <li key={j}>{k.control}: {k.estado === "CUADRA" ? "cuadra" : Math.abs(k.diferencia) < 1 ? `diferencia aritmética de ${cop(Math.abs(k.diferencia))} entre las cifras documentadas` : `no cuadra (diferencia ${cop(k.diferencia)})`}</li>)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

/**
 * Ficha ejecutiva de un edificio: nombre, responsable, valor, área y valor por m² a la vista; debajo, solo el desglose y la comparación.
 * Todo lo demás (otras fuentes, documentos, cálculo) está en un panel lateral. Pantalla y PDF consumen la misma capa de datos.
 */
export function FichaEjecutiva({ ficha, clave }: { ficha: FichaPrecios; clave: string }) {
  const f = ficha.fila;
  const x = f.ejecutivo;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [ultimo, setUltimo] = useState<Panel>("fuentes");
  const abrir = (p: Panel) => { setUltimo(p); setPanel(p); };
  const contrato = x.contrato?.fuente;
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="largo" style={{ margin: 0, fontSize: 34, lineHeight: 1.15, color: "#1B3A6B" }}>{f.nombre}</h1>
          <p className="texto-secundario largo" style={{ margin: "6px 0 0", fontSize: 16 }}>
            {[f.direccion, f.responsable ? `Responsable: ${f.responsable.nombre}` : "Responsable por identificar"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {contrato?.version_id ? <BotonEnlace size="large" icon={<FileTextOutlined aria-hidden />} href={urlVisor(contrato.version_id, contrato.pagina)}>{x.contrato?.conjunto ? "Ver contrato conjunto" : "Ver contrato"}</BotonEnlace> : null}
          <BotonPdf href={`/api/monitoreo-contratacion/exportar/pdf/edificio/${clave}`} />
        </div>
      </header>

      <DatosClave f={f} />

      {(
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginTop: -6 }}>
          <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "1 1 360px" }}>
            {x.nota && <span className="texto-secundario" style={{ fontSize: 15.5 }}>{x.nota}</span>}
            {x.diferencias_visibles.map((t) => (
              <span key={t} style={{ fontSize: 15.5, borderLeft: "3px solid #1B3A6B", background: "#EEF2F9", padding: "6px 12px", borderRadius: 4 }}><strong>Diferencia entre fuentes.</strong> {t}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {x.contrato?.conjunto && <BotonEnlace icon={<FolderOpenOutlined aria-hidden />} href={`/expedientes/${x.contrato.proceso_id}`}>Resumen del contrato</BotonEnlace>}
            <Button icon={<FileSearchOutlined aria-hidden />} onClick={() => abrir("fuentes")}>Ver fuentes</Button>
            <Button icon={<FolderOpenOutlined aria-hidden />} onClick={() => abrir("documentos")}>Documentos relacionados</Button>
          </div>
        </div>
      )}

      <section aria-labelledby="sec-a"><h2 id="sec-a" style={h2}>A. Desglose del precio</h2><Desglose ficha={ficha} key={clave} /></section>
      <section aria-labelledby="sec-b"><h2 id="sec-b" style={h2}>B. Comparación de ofertas</h2><Comparacion ficha={ficha} /></section>

      <PanelLateral ficha={ficha} abierto={panel !== null} panel={panel ?? ultimo} cambiar={(p) => { setUltimo(p); setPanel(p); }} cerrar={() => setPanel(null)} />
    </div>
  );
}
