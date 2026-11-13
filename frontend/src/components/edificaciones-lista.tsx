"use client";
import { EtiquetaInformativa } from "@/components/estado-informativo";
import { BotonEnlace } from "@/components/boton-enlace";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Empty, Grid, Input, Skeleton, Table, Tag, Typography } from "antd";
import { ArrowRightOutlined, SearchOutlined } from "@ant-design/icons";
import { useEdificios } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import type { EdificioFila } from "@/types/contratacion";

const CLAVES = ["q"] as const;
const TONO: Record<string, string> = { VERIFICADA: "success", NO_APLICA: "success", PENDIENTE_SOPORTE: "warning", POR_CONFIRMAR_ALCANCE: "warning", SIN_INTERVENCION: "default" };

function Contenido() {
  const { valores, cambiar } = useUrlState(CLAVES);
  const [texto, setTexto] = useState(valores.q);
  const movil = !Grid.useBreakpoint().md;
  useEffect(() => {
    if (texto === valores.q) return;
    const t = setTimeout(() => cambiar({ q: texto }), 250);
    return () => clearTimeout(t);
  }, [texto, valores.q, cambiar]);
  const q = useEdificios(valores.q);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  const filas = q.data?.edificios ?? [];
  const procesos = (e: EdificioFila) => e.procesos.length === 0
    ? <EtiquetaInformativa>Proceso contractual por vincular</EtiquetaInformativa>
    : e.procesos.map((p) => <div key={p.id}><Link href={`/documentos/trazabilidad/expediente/${p.id}`}>{p.proceso}</Link></div>);

  return (
    <>
      <Input size="large" allowClear prefix={<SearchOutlined />} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar edificación o dirección" aria-label="Buscar edificación" style={{ maxWidth: 560, height: 52 }} />
      <div style={{ marginTop: 16 }}>
        {q.isLoading ? <Skeleton active /> : q.isError ? <ErrorCarga texto="No fue posible cargar las edificaciones." onReintentar={() => q.refetch()} />
          : filas.length === 0 ? <Empty description="Ninguna edificación coincide." />
          : movil ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {filas.map((e) => (
                <li key={e.id} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: 14 }}>
                  <strong className="largo">{e.nombre}</strong>
                  <div className="texto-secundario largo">{e.direccion ?? ""}</div>
                  <div style={{ margin: "8px 0" }}><Tag color={TONO[e.resolucion.requisito] ?? "default"} style={{ whiteSpace: "normal" }}>{e.resolucion.etiqueta}</Tag></div>
                  <div>{procesos(e)}</div>
                  <BotonEnlace href={`/documentos/trazabilidad/edificio/${e.id}`} block type="primary" style={{ marginTop: 10 }}>Abrir trazabilidad · {e.documentos} documentos</BotonEnlace>
                </li>
              ))}
            </ul>
          ) : (
            <Table<EdificioFila> rowKey="id" dataSource={filas} pagination={false}
              columns={[
                { title: "Edificación", render: (_, e) => <div className="largo"><strong style={{ fontSize: 16 }}>{e.nombre}</strong><div className="texto-secundario" style={{ fontSize: 13.5 }}>{e.direccion ?? ""}</div></div> },
                { title: "Resolución", render: (_, e) => <Tag color={TONO[e.resolucion.requisito] ?? "default"} style={{ whiteSpace: "normal" }}>{e.resolucion.etiqueta}</Tag> },
                { title: "Proceso contractual", render: (_, e) => procesos(e) },
                { title: "Documentos", align: "right", dataIndex: "documentos", render: (n) => <span className="cifra">{n}</span> },
                { title: "", width: 130, render: (_, e) => <BotonEnlace href={`/documentos/trazabilidad/edificio/${e.id}`} type="primary" icon={<ArrowRightOutlined />} iconPosition="end">Abrir</BotonEnlace> },
              ]} />
          )}
      </div>
    </>
  );
}

export function ListaEdificaciones() {
  return <Suspense><Contenido /></Suspense>;
}
