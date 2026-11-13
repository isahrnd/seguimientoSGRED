"use client";
import { BotonEnlace } from "@/components/boton-enlace";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Empty, Grid, Input, Pagination, Segmented, Select, Skeleton, Table, Tag, Typography } from "antd";
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileOutlined, SearchOutlined } from "@ant-design/icons";
import { useBiblioteca } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { esErrorDeAcceso } from "@/lib/api";
import { urlAbrirOriginal } from "@/lib/format";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import type { DocumentoBiblioteca, Faceta } from "@/types/contratacion";
import { ListaExpedientes } from "@/components/expedientes-lista";
import { ListaEdificaciones } from "@/components/edificaciones-lista";
import { IndiceControl } from "@/components/indice-control";
import { PALETA } from "@/theme/theme";

const SECCIONES = ["seccion"] as const;
const CLAVES = ["vista", "q", "categoria", "formato", "edificacion", "origen", "expediente", "pagina"] as const;
const opciones = (f?: Faceta[]) => (f ?? []).map((x) => ({ value: x.valor, label: `${x.nombre} (${x.n})` }));

function IconoFormato({ f }: { f: DocumentoBiblioteca["formato"] }) {
  const estilo = { fontSize: 20, color: PALETA.tinta };
  return f === "XLSX" ? <FileExcelOutlined style={estilo} aria-label="Excel" /> : f === "PDF" ? <FilePdfOutlined style={estilo} aria-label="PDF" /> : <FileOutlined style={estilo} aria-label="Otro formato" />;
}

function Vinculos({ d }: { d: DocumentoBiblioteca }) {
  const partes: React.ReactNode[] = [];
  if (d.expediente) partes.push(<Link key="e" href={`/documentos/trazabilidad/expediente/${d.expediente.id}`}>{d.expediente.proceso}{d.expediente.confirmado ? "" : " (sugerido)"}</Link>);
  if (d.edificios_confirmados.length) partes.push(<span key="b">{d.edificios_confirmados.map((x) => x.nombre).join(", ")}</span>);
  else if (d.es_general) partes.push(<span key="g">Comparativo general</span>);
  if (d.empresas.length) partes.push(<span key="m">{d.empresas.filter((e) => e.estado !== "DESCARTADA").map((e) => e.valor).join(", ")}</span>);
  return <>{partes.filter(Boolean).map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)}</>;
}

function Biblioteca() {
  const { valores, cambiar } = useUrlState(CLAVES);
  const [texto, setTexto] = useState(valores.q);
  const movil = !Grid.useBreakpoint().md;
  useEffect(() => {
    if (texto === valores.q) return;
    const t = setTimeout(() => cambiar({ q: texto, pagina: "" }), 250);
    return () => clearTimeout(t);
  }, [texto, valores.q, cambiar]);
  useEffect(() => { setTexto(valores.q); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.q]);

  const pagina = Number(valores.pagina) || 1;
  const q = useBiblioteca({ vista: valores.vista || "todos", q: valores.q, categoria: valores.categoria, formato: valores.formato, edificacion: valores.edificacion, origen: valores.origen, expediente: valores.expediente, pagina });
  useScrollRestore(`docs:${JSON.stringify(valores)}`, !!q.data);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  const d = q.data;
  const hayFiltros = valores.categoria || valores.formato || valores.edificacion || valores.origen || valores.expediente;
  const abrir = (x: DocumentoBiblioteca) => x.version_id && x.disponible
    ? <BotonEnlace href={urlAbrirOriginal(x.nombre, x.version_id)} type="primary">Abrir soporte</BotonEnlace>
    : <span className="texto-secundario" style={{ fontSize: 13.5 }}>No disponible</span>;
  const estado = (x: DocumentoBiblioteca) => x.clasificado
    ? <Tag color="success">{x.categoria?.nombre ?? "Clasificado"}</Tag>
    : <Tag color="warning">Por revisar{x.categoria ? ` · ${x.categoria.nombre}` : ""}</Tag>;

  return (
    <>
      <Input size="large" allowClear prefix={<SearchOutlined />} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, edificación, empresa o proceso" aria-label="Buscar documentos" style={{ maxWidth: 760, height: 52 }} />
      <div style={{ marginTop: 16 }}>
        <Segmented
          value={valores.vista || "todos"}
          onChange={(v) => cambiar({ vista: v === "todos" ? "" : String(v), pagina: "" })}
          options={[
            { label: `Todos${d ? ` (${d.conteos.todos})` : ""}`, value: "todos" },
            { label: `Clasificados${d ? ` (${d.conteos.clasificados})` : ""}`, value: "clasificados" },
            { label: `Por revisar${d ? ` (${d.conteos.revisar})` : ""}`, value: "revisar" },
            { label: `Comparativos generales${d ? ` (${d.conteos.generales})` : ""}`, value: "generales" },
          ]}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <Select allowClear placeholder="Categoría" style={{ minWidth: 200 }} value={valores.categoria || undefined} onChange={(v) => cambiar({ categoria: v ?? "", pagina: "" })} options={opciones(d?.facetas.categorias)} aria-label="Categoría" />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Edificación" style={{ minWidth: 220 }} value={valores.edificacion || undefined} onChange={(v) => cambiar({ edificacion: v ?? "", pagina: "" })} options={opciones(d?.facetas.edificaciones)} aria-label="Edificación" />
        <Select allowClear placeholder="Formato" style={{ minWidth: 130 }} value={valores.formato || undefined} onChange={(v) => cambiar({ formato: v ?? "", pagina: "" })} options={opciones(d?.facetas.formatos)} aria-label="Formato" />
        <Select allowClear placeholder="Origen" style={{ minWidth: 150 }} value={valores.origen || undefined} onChange={(v) => cambiar({ origen: v ?? "", pagina: "" })} options={opciones(d?.facetas.origenes)} aria-label="Origen" />
        {valores.expediente && <Tag closable onClose={() => cambiar({ expediente: "", pagina: "" })} style={{ alignSelf: "center" }}>Proceso filtrado</Tag>}
        {hayFiltros && <Button type="link" onClick={() => cambiar({ categoria: "", edificacion: "", formato: "", origen: "", expediente: "", pagina: "" })}>Quitar filtros</Button>}
        <Typography.Text type="secondary" style={{ marginLeft: "auto", alignSelf: "center" }} aria-live="polite">{d ? `${d.total} documentos` : ""}</Typography.Text>
      </div>

      <div style={{ marginTop: 16 }}>
        {q.isLoading ? <Skeleton active paragraph={{ rows: 8 }} />
          : q.isError ? <ErrorCarga texto="No fue posible cargar los documentos." onReintentar={() => q.refetch()} />
          : !d || d.items.length === 0 ? <Empty description="Ningún documento coincide con la búsqueda." />
          : movil ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {d.items.map((x) => (
                <li key={x.documento_id} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: 12 }}>
                  <div className="largo" style={{ fontWeight: 600 }}><IconoFormato f={x.formato} /> {x.nombre}</div>
                  <div className="texto-secundario largo" style={{ fontSize: 13.5, margin: "4px 0 8px" }}><Vinculos d={x} /></div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{estado(x)}{abrir(x)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <Table<DocumentoBiblioteca> rowKey="documento_id" size="middle" dataSource={d.items} pagination={false}
              columns={[
                { title: "", width: 40, render: (_, x) => <IconoFormato f={x.formato} /> },
                { title: "Documento", render: (_, x) => (
                  <div style={{ minWidth: 280, maxWidth: 640 }}>
                    <div className="largo" style={{ fontWeight: 600 }} title={x.nombre}>{x.nombre}</div>
                    <div className="texto-secundario largo" style={{ fontSize: 13.5 }}><Vinculos d={x} />{x.asociaciones_faltantes.length > 0 && <span style={{ color: PALETA.ambar }}> · pendiente: {x.asociaciones_faltantes.join(", ").toLowerCase()}</span>}</div>
                  </div>) },
                { title: "Clasificación", render: (_, x) => estado(x) },
                { title: "Origen", responsive: ["lg"], render: (_, x) => x.origenes.map((o) => <Tag key={o.tipo}>{o.tipo === "LOCAL" ? "Local" : "Drive"}{o.estado === "ACTIVO" ? "" : " (retirado)"}</Tag>) },
                { title: "", width: 150, align: "right", render: (_, x) => abrir(x) },
              ]} />
          )}
      </div>
      {d && d.total > d.tam && (
        <Pagination style={{ marginTop: 16, textAlign: "right" }} current={d.pagina} pageSize={d.tam} total={d.total} showSizeChanger={false} onChange={(p) => { cambiar({ pagina: p > 1 ? String(p) : "" }); window.scrollTo(0, 0); }} />
      )}
    </>
  );
}

type Seccion = "documentos" | "expedientes" | "edificaciones";

/** Gestión documental: la biblioteca y, con los mismos permisos, las listas técnicas de expedientes y edificaciones (trazabilidad, vínculos y estados internos). */
function Contenido() {
  const { valores, cambiar } = useUrlState(SECCIONES);
  const seccion = (["expedientes", "edificaciones"].includes(valores.seccion) ? valores.seccion : "documentos") as Seccion;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><IndiceControl /></div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 16px" }}>
        <Typography.Title level={1} style={{ margin: 0, fontSize: 30 }}>Documentos</Typography.Title>
        <Segmented<Seccion>
          value={seccion} onChange={(v) => cambiar({ seccion: v === "documentos" ? "" : v })}
          options={[{ label: "Biblioteca", value: "documentos" }, { label: "Expedientes", value: "expedientes" }, { label: "Edificaciones", value: "edificaciones" }]}
        />
      </div>
      {seccion === "expedientes" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 12px" }}>
            <Button href="/api/monitoreo-contratacion/exportar/resumen-contratos" icon={<DownloadOutlined />} aria-label="Exportar resumen por contrato (Excel)">Exportar resumen por contrato</Button>
          </div>
          <ListaExpedientes completo />
        </>
      )}
      {seccion === "edificaciones" && <ListaEdificaciones />}
      {seccion === "documentos" && <Biblioteca />}
    </>
  );
}

export default function DocumentosPage() {
  return <Suspense><Contenido /></Suspense>;
}
