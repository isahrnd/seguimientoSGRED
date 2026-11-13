"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Grid, Input, Skeleton, Table, Typography } from "antd";
import { ArrowRightOutlined, SearchOutlined } from "@ant-design/icons";
import { usePreciosPorEdificio } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { cop } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import type { FilaPrecios } from "@/types/contratacion";
import { BotonExcel, BotonPdf, m2 } from "@/components/precios/comunes";

const CLAVES = ["q"] as const;
const rutaFicha = (f: FilaPrecios) => `/demoliciones/${f.clave}`;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const Nombre = ({ f }: { f: FilaPrecios }) => (
  <div className="largo" style={{ minWidth: 200 }}>
    <Link href={rutaFicha(f)} style={{ fontWeight: 700, fontSize: 17, color: "#1B3A6B" }}>{f.nombre}</Link>
    {f.direccion && <div className="texto-secundario" style={{ fontSize: 14 }}>{f.direccion}</div>}
  </div>
);

/** Valor con su carácter: «reportado» (consolidado) o «contratado» (contrato verificado). Un contrato conjunto no se asigna al edificio. */
const Valor = ({ f }: { f: FilaPrecios }) =>
  f.valor ? (
    <div style={{ display: "grid", justifyItems: "end" }}>
      <span className="cifra" style={{ fontWeight: 700, fontSize: 16 }}>{cop(f.valor.valor)}</span>
      <span className="texto-secundario" style={{ fontSize: 13.5 }}>{f.valor.procedencia === "CONTRATO" ? "contratado" : "reportado"}</span>
    </div>
  ) : f.contrato_conjunto ? (
    <div style={{ display: "grid", justifyItems: "end" }}>
      <span style={{ fontWeight: 600 }}>Contrato conjunto</span>
      <span className="texto-secundario" style={{ fontSize: 13.5 }}>{f.contrato_conjunto.edificios} edificios · sin repartir</span>
    </div>
  ) : <span className="texto-secundario">—</span>;

const Metros = ({ f }: { f: FilaPrecios }) => (f.area ? <span className="cifra">{m2(f.area.valor)}</span> : <span className="texto-secundario">Por precisar</span>);
const PorM2 = ({ f }: { f: FilaPrecios }) =>
  f.valor_m2 ? (
    <div style={{ display: "grid", justifyItems: "end" }}>
      <span className="cifra" style={{ fontWeight: 650 }}>{cop(f.valor_m2.valor)}</span>
      <span className="texto-secundario" style={{ fontSize: 13.5 }}>{f.valor_m2.clase === "REPORTADO" ? "reportado" : "contratado"}</span>
    </div>
  ) : <span className="texto-secundario">—</span>;

function Contenido() {
  const q = usePreciosPorEdificio();
  const movil = !Grid.useBreakpoint().md;
  const { valores, cambiar } = useUrlState(CLAVES);
  const [texto, setTexto] = useState(valores.q);
  useEffect(() => {
    if (texto === valores.q) return;
    const t = setTimeout(() => cambiar({ q: texto }), 250);
    return () => clearTimeout(t);
  }, [texto, valores.q, cambiar]);

  const d = q.data;
  const filas = useMemo(() => {
    const t = sinTildes(valores.q.trim());
    return (d?.filas ?? []).filter((f) => !t || sinTildes(`${f.nombre} ${f.direccion ?? ""} ${f.responsable?.nombre ?? ""}`).includes(t));
  }, [d, valores.q]);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !d) return <ErrorCarga texto="No fue posible cargar las demoliciones." onReintentar={() => q.refetch()} />;

  const filtrado = filas.length !== d.filas.length;
  const filtro = filtrado ? `?claves=${filas.map((f) => f.clave).join(",")}` : "";
  const corte = d.fecha_corte ? ` · consolidado con corte al ${d.fecha_corte.slice(8, 10)}/${d.fecha_corte.slice(5, 7)}/${d.fecha_corte.slice(0, 4)}` : "";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Typography.Title level={1} style={{ margin: 0, fontSize: 32 }}>Demoliciones</Typography.Title>
          <p className="texto-secundario" style={{ margin: "4px 0 0", fontSize: 15.5 }}>Valor, área y valor por m² de cada edificio{corte}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BotonExcel href={`/api/monitoreo-contratacion/exportar/precios-por-edificio${filtro}`} />
          <BotonPdf href={`/api/monitoreo-contratacion/exportar/pdf/analisis-precios${filtro}`} texto={filtrado ? `Exportar PDF (${filas.length})` : "Exportar PDF"} />
        </div>
      </div>

      <Input allowClear size="large" prefix={<SearchOutlined />} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar edificio, dirección o responsable" aria-label="Buscar edificio" style={{ maxWidth: 620, height: 52 }} />

      {movil ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
          {filas.map((f) => (
            <li key={f.clave} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
              <Nombre f={f} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div className="etq-valor">Valor</div><div style={{ display: "grid" }}><Valor f={f} /></div></div>
                <div><div className="etq-valor">Valor/m²</div><div style={{ display: "grid" }}><PorM2 f={f} /></div></div>
                <div><div className="etq-valor">Área</div><Metros f={f} /></div>
                <div><div className="etq-valor">Responsable</div>{f.responsable?.nombre ?? <span className="texto-secundario">—</span>}</div>
              </div>
              <Link href={rutaFicha(f)} style={{ fontWeight: 600 }}>Ver detalle <ArrowRightOutlined aria-hidden /></Link>
            </li>
          ))}
        </ul>
      ) : (
        <Table<FilaPrecios>
          rowKey="clave" dataSource={filas} pagination={false} size="middle" scroll={{ x: 900 }} locale={{ emptyText: "Ningún edificio coincide con la búsqueda" }}
          columns={[
            { title: "Edificio", key: "n", render: (_, f) => <Nombre f={f} /> },
            { title: "Responsable", key: "r", width: 170, render: (_, f) => f.responsable?.nombre ?? <span className="texto-secundario">—</span> },
            { title: "Valor", key: "v", align: "right", width: 200, render: (_, f) => <Valor f={f} /> },
            { title: "Área m²", key: "a", align: "right", width: 140, render: (_, f) => <Metros f={f} /> },
            { title: "Valor/m²", key: "m", align: "right", width: 160, render: (_, f) => <PorM2 f={f} /> },
            { title: "", key: "d", width: 140, render: (_, f) => <Link href={rutaFicha(f)} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Ver detalle <ArrowRightOutlined aria-hidden /></Link> },
          ]}
        />
      )}
      <p className="texto-secundario" style={{ margin: 0, fontSize: 14 }}>«Reportado» es un dato del consolidado de seguimiento; solo «contratado» cuenta con un contrato incorporado.</p>
    </div>
  );
}

export default function DemolicionesPage() {
  return <Suspense><Contenido /></Suspense>;
}
