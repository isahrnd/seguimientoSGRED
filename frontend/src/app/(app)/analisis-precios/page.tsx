"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Collapse, Grid, Input, Select, Skeleton, Table, Typography } from "antd";
import { ArrowRightOutlined, SearchOutlined } from "@ant-design/icons";
import { usePreciosPorEdificio } from "@/hooks/queries";
import { cop } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { EtiquetaInformativa } from "@/components/estado-informativo";
import type { FilaPrecios } from "@/types/contratacion";
import { BotonExcel, BotonPdf, m2, ValorFila, VerFuente } from "@/components/precios/comunes";

const rutaDetalle = (f: FilaPrecios) => (f.edificio_id !== null ? `/edificaciones/${f.edificio_id}` : `/analisis-precios/${f.clave}`);

/** Estado en una etiqueta compacta: un trámite pendiente es informativo (no una advertencia). */
const Estado = ({ f }: { f: FilaPrecios }) => (
  <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
    <EtiquetaInformativa>{f.estado.etiqueta}</EtiquetaInformativa>
    {f.estado.avance && <span className="texto-secundario" style={{ fontSize: 12.5 }}>Avance {f.estado.avance.toLowerCase()}</span>}
  </div>
);

const Nombre = ({ f }: { f: FilaPrecios }) => (
  <div className="largo" style={{ minWidth: 190 }}>
    <Link href={rutaDetalle(f)} style={{ fontWeight: 700, fontSize: 17, color: "#1B3A6B" }}>{f.nombre}</Link>
    {f.direccion && <div className="texto-secundario" style={{ fontSize: 13 }}>{f.direccion}</div>}
  </div>
);

const M2 = ({ f }: { f: FilaPrecios }) => (
  f.valor_m2
    ? <div><div className="cifra" style={{ fontWeight: 650 }}>{cop(f.valor_m2.valor)}</div><div className="texto-secundario" style={{ fontSize: 12 }}>{f.valor_m2.clase === "REPORTADO" ? "reportado" : "contratado"}</div></div>
    : <span className="texto-secundario">—</span>
);

export default function AnalisisPreciosPage() {
  const q = usePreciosPorEdificio();
  const movil = !Grid.useBreakpoint().md;
  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState<string | undefined>();
  const [procedencia, setProcedencia] = useState<string | undefined>();

  const d = q.data;
  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (d?.filas ?? []).filter((f) => {
      if (t && !`${f.nombre} ${f.direccion ?? ""} ${f.responsable?.nombre ?? ""}`.toLowerCase().includes(t)) return false;
      if (responsable && f.responsable?.nombre !== responsable) return false;
      if (procedencia) {
        const p = f.valor?.procedencia ?? (f.contrato_conjunto ? "CONJUNTO" : "SIN_VALOR");
        if (p !== procedencia) return false;
      }
      return true;
    });
  }, [d, texto, responsable, procedencia]);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !d) return <ErrorCarga texto="No fue posible cargar el análisis de precios." onReintentar={() => q.refetch()} />;

  const responsables = [...new Set(d.filas.map((f) => f.responsable?.nombre).filter(Boolean) as string[])].sort();
  const pdf = `/api/monitoreo-contratacion/exportar/pdf/analisis-precios${filas.length !== d.filas.length ? `?claves=${filas.map((f) => f.clave).join(",")}` : ""}`;
  const fuenteConsolidado = d.fuentes[0];
  const filtro = filas.length !== d.filas.length ? `?claves=${filas.map((f) => f.clave).join(",")}` : "";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Typography.Title level={1} style={{ margin: 0, fontSize: 30 }}>Análisis de precios</Typography.Title>
          <p className="texto-secundario" style={{ margin: "4px 0 0" }}>
            Valor, superficie y precio por m² de cada edificio{d.fecha_corte ? ` · consolidado con corte al ${d.fecha_corte.slice(8, 10)}/${d.fecha_corte.slice(5, 7)}/${d.fecha_corte.slice(0, 4)}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BotonExcel href={`/api/monitoreo-contratacion/exportar/precios-por-edificio${filtro}`} />
          <BotonPdf href={pdf} texto={filas.length !== d.filas.length ? `Exportar PDF (${filas.length} edificios)` : "Exportar PDF"} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: movil ? "1fr" : "minmax(240px, 1fr) 220px 220px", gap: 10 }}>
        <Input allowClear size="large" prefix={<SearchOutlined />} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar edificio, dirección o responsable" aria-label="Buscar edificio" />
        <Select allowClear size="large" placeholder="Responsable" aria-label="Filtrar por responsable" value={responsable} onChange={setResponsable} options={responsables.map((r) => ({ value: r, label: r }))} />
        <Select
          allowClear size="large" placeholder="Procedencia del valor" aria-label="Filtrar por procedencia" value={procedencia} onChange={setProcedencia}
          options={[{ value: "CONTRATO", label: "Contrato" }, { value: "CONSOLIDADO", label: "Consolidado" }, { value: "CONJUNTO", label: "Contrato conjunto" }, { value: "SIN_VALOR", label: "Sin valor" }]}
        />
      </div>

      {movil ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {filas.map((f) => (
            <li key={f.clave} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
              <Nombre f={f} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div className="etq-valor">Valor</div><ValorFila f={f} compacto /></div>
                <div><div className="etq-valor">Valor/m²</div><M2 f={f} /></div>
                <div><div className="etq-valor">Área</div>{f.area ? <span className="cifra">{m2(f.area.valor)}</span> : <span className="texto-secundario">Por precisar</span>}</div>
                <div><div className="etq-valor">Responsable</div>{f.responsable?.nombre ?? <span className="texto-secundario">—</span>}</div>
              </div>
              <Estado f={f} />
              <Link href={rutaDetalle(f)} style={{ fontWeight: 600 }}>Ver detalle <ArrowRightOutlined aria-hidden /></Link>
            </li>
          ))}
        </ul>
      ) : (
        <Table<FilaPrecios>
          rowKey="clave" dataSource={filas} pagination={false} size="middle" scroll={{ x: 980 }} locale={{ emptyText: "Ningún edificio coincide con el filtro" }}
          columns={[
            { title: "Edificio", key: "n", render: (_, f) => <Nombre f={f} /> },
            { title: "Responsable", key: "r", width: 150, render: (_, f) => f.responsable?.nombre ?? <span className="texto-secundario">—</span> },
            { title: "Valor", key: "v", align: "right", width: 190, render: (_, f) => <div style={{ display: "grid", justifyItems: "end" }}><ValorFila f={f} /></div> },
            { title: "Área m²", key: "a", align: "right", width: 120, render: (_, f) => (f.area ? <span className="cifra">{m2(f.area.valor)}</span> : <span className="texto-secundario">Por precisar</span>) },
            { title: "Valor/m²", key: "m", align: "right", width: 130, render: (_, f) => <div style={{ display: "grid", justifyItems: "end" }}><M2 f={f} /></div> },
            { title: "Estado", key: "e", width: 200, render: (_, f) => <Estado f={f} /> },
            { title: "", key: "d", width: 130, render: (_, f) => <Link href={rutaDetalle(f)} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Ver detalle <ArrowRightOutlined aria-hidden /></Link> },
          ]}
        />
      )}

      <p className="texto-secundario" style={{ margin: 0, fontSize: 13.5 }}>
        Los valores marcados «Consolidado» son datos reportados en el consolidado de seguimiento; no verifican un contrato firmado. Un contrato conjunto no se asigna a cada edificio.{" "}
        {fuenteConsolidado && <VerFuente fuente={{ version_id: fuenteConsolidado.version_id, documento: fuenteConsolidado.documento, pagina: null, hoja: null, celda: null }} texto="Ver consolidado" />}
      </p>

      {d.revision.length > 0 && (
        <Collapse
          size="small"
          items={[{
            key: "rev", label: `Revisión operativa (${d.revision.length})`,
            children: (
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {d.revision.map((r, i) => <li key={i} className="largo"><strong>{r.tipo}</strong> · {r.edificio}: {r.detalle} <VerFuente fuente={r.fuente} /></li>)}
              </ul>
            ),
          }]}
        />
      )}
    </div>
  );
}
