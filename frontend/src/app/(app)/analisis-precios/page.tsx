"use client";
import { BotonEnlace } from "@/components/boton-enlace";
import Link from "next/link";
import { Alert, Button, Skeleton, Table, Tag, Typography } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { useAnalisisPrecios } from "@/hooks/queries";
import { PENDIENTE, cop, etiquetaProceso } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { ResultadoTag } from "@/components/analisis-precios";
import { SoporteLink } from "@/components/soporte-link";
import type { FilaAnalisisPrecios } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";

const TIPO: Record<string, string> = { DEMOLICION: "Demolición", IZAJE_GRUAS: "Izaje con grúas", OTRA: "Otra intervención" };

export default function AnalisisPreciosPage() {
  const q = useAnalisisPrecios();
  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar el análisis de precios." onReintentar={() => q.refetch()} />;
  const d = q.data;
  const total = (v: number | null) => (v === null ? <span className="texto-secundario" style={{ fontSize: 16 }}>Documentación contractual por incorporar</span> : <span className="cifra importe">{cop(v)}</span>);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Typography.Title level={1} style={{ margin: 0, fontSize: 30 }}>Análisis de precios</Typography.Title>

      <div className="grupo-valores grupo-3">
        <div><div className="etq-valor">Contratado en demoliciones</div>{total(d.totales.contratado_demoliciones)}</div>
        <div><div className="etq-valor">Contratado en izaje con grúas</div>{total(d.totales.contratado_izaje_gruas)}</div>
        <div><div className="etq-valor">Intervenciones con contrato soportado</div><span className="importe cifra">{d.totales.con_contrato_soportado}</span> <span className="texto-secundario">de {d.expedientes.length}</span></div>
      </div>

      <Alert type="info" showIcon message={d.aviso} />

      <Table<FilaAnalisisPrecios>
        rowKey="id"
        dataSource={d.expedientes}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: "Intervención", render: (_, f) => (
            <div className="largo" style={{ minWidth: 240 }}>
              <strong style={{ fontSize: 16 }}>{f.intervencion}</strong>
              <div className="texto-secundario" style={{ fontSize: 13.5 }}>{etiquetaProceso(f)} · {TIPO[f.tipo_intervencion]}{[...f.edificios, ...f.sectores].length ? ` · ${[...f.edificios, ...f.sectores].join(", ")}` : ""}</div>
            </div>) },
          { title: "Contratado", align: "right", render: (_, f) => (f.valor_contratado?.sustentado
            ? <div><div className="cifra" style={{ fontWeight: 700, fontSize: 17 }}>{cop(f.valor_contratado.valor_actualizado ?? f.valor_contratado.valor_inicial)}</div><SoporteLink soporte={f.soporte_contrato} corto /></div>
            : <span className="texto-secundario">{f.reportado_contratado ? "Reportado; documentación contractual por incorporar" : f.presentacion?.etiqueta ?? "Documentación contractual por incorporar"}</span>) },
          { title: "Referencias", render: (_, f) => <span>{f.ofertas} {f.ofertas === 1 ? "oferta" : "ofertas"} · {f.referencias_independientes} independientes{f.rango && <div className="cifra texto-secundario" style={{ fontSize: 13 }}>{cop(f.rango.min)} a {cop(f.rango.max)}</div>}</span> },
          { title: "Lectura", render: (_, f) => <div style={{ maxWidth: 320 }}><ResultadoTag r={f.resultado} presentacion={f.presentacion} /></div> },
          { title: "", width: 130, render: (_, f) => <BotonEnlace href={`/expedientes/${f.id}`} type="primary" icon={<ArrowRightOutlined />} iconPosition="end">Abrir</BotonEnlace> },
        ]}
      />

      {d.pendientes_de_soporte.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>Documentación contractual por incorporar</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {d.pendientes_de_soporte.map((p) => (
              <li key={p.id} className="largo"><Link href={`/expedientes/${p.id}`}>{p.intervencion}</Link> <Tag color={p.reportado_contratado ? "processing" : "default"}>{p.reportado_contratado ? "reportado contratado" : "sin reporte"}</Tag> — por incorporar: {p.documento_necesario}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
