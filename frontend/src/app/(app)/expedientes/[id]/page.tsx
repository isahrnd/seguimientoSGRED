"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Select, Skeleton, Table, Tabs, Tag } from "antd";
import { useComparar, useDetalleExpediente, useExpedientes } from "@/hooks/queries";
import { ESTADO_ETQ, PENDIENTE, cop, fechaCorta, precioConUnidad } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import type { Hecho, Valor } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { SoporteLink, urlVisor } from "@/components/soporte-link";
import { SintesisEconomica } from "@/components/sintesis-economica";
import { AnalisisPreciosExpediente, ResultadoTag } from "@/components/analisis-precios";
import { ComparacionCotizaciones, ResultadoPct } from "@/components/comparacion-cotizaciones";
import { Volver } from "@/components/volver";
import { EdificiosSoportes } from "@/components/edificios-soportes";

const Vacio = ({ texto = PENDIENTE }: { texto?: string }) => <p className="texto-secundario" style={{ border: `1px dashed ${PALETA.borde}`, borderRadius: 8, padding: 14, margin: 0, background: "#fff" }}>{texto}</p>;

function Lista({ items, vacio }: { items: Hecho[]; vacio: string }) {
  if (items.length === 0) return <Vacio texto={vacio} />;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {items.map((h) => (
        <li key={h.clave} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}><strong className="largo">{h.titulo}</strong><SoporteLink soporte={h.soporte} /></div>
          {h.detalle && <div className="texto-secundario largo">{h.detalle}</div>}
        </li>
      ))}
    </ul>
  );
}

function ComparadorEntreIntervenciones({ id }: { id: number }) {
  const [otro, setOtro] = useState<number | null>(null);
  const lista = useExpedientes({});
  const cmp = useComparar(id, otro);
  const grupos = useMemo(() => {
    const pares = cmp.data?.pares ?? [];
    return { comparables: pares.filter((p) => p.resultado.comparable), no: pares.filter((p) => !p.resultado.comparable) };
  }, [cmp.data]);
  return (
    <div>
      <p className="texto-secundario" style={{ maxWidth: 820 }}>Se muestra el porcentaje solo si actividad, alcance, unidad y tratamiento económico coinciden. No es un veredicto sobre sobrecostos.</p>
      <Select style={{ minWidth: 320, maxWidth: "100%" }} placeholder="Elegir intervención a comparar" aria-label="Intervención a comparar" value={otro ?? undefined} onChange={setOtro}
        options={(lista.data?.expedientes ?? []).filter((e) => e.id !== id).map((e) => ({ value: e.id, label: `${e.proceso} · ${e.intervencion}` }))} />
      {cmp.isLoading && <Skeleton active style={{ marginTop: 16 }} />}
      {cmp.data && (
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {[cmp.data.a, cmp.data.b].map((x) => (
              <div key={x.id} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 14 }}>
                <strong>{x.proceso}</strong>
                <div className="texto-secundario">{x.intervencion}</div>
                <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>Factores documentados</div>
                {x.factores.length === 0 ? <div className="texto-secundario">{PENDIENTE}</div> : <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{x.factores.map((f) => <li key={f.clave}>{f.titulo}</li>)}</ul>}
              </div>
            ))}
          </div>
          {grupos.comparables.length > 0 && (
            <div>
              <strong>Precios comparables</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {grupos.comparables.map((p, i) => (
                  <li key={i}>{p.a.descripcion} (<span className="cifra">{precioConUnidad(p.a.precio_unitario, p.a.unidad)}</span>) frente a {p.b.descripcion} (<span className="cifra">{precioConUnidad(p.b.precio_unitario, p.b.unidad)}</span>) <ResultadoPct r={p.resultado} /></li>
                ))}
              </ul>
            </div>
          )}
          {grupos.no.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>No comparables ({grupos.no.length}) y por qué</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {Array.from(new Map(grupos.no.map((p) => [p.resultado.motivo, p])).values()).map((p, i) => <li key={i} className="texto-secundario">{p.resultado.motivo}</li>)}
              </ul>
            </details>
          )}
          <p className="texto-secundario" style={{ fontSize: 13.5 }}>{cmp.data.aviso}</p>
        </div>
      )}
    </div>
  );
}

function TablaValores({ valores }: { valores: Valor[] }) {
  if (valores.length === 0) return <Vacio texto="Pendiente de soporte: no hay actas ni valores ejecutados registrados." />;
  return (
    <Table<Valor> size="middle" rowKey="id" dataSource={valores} pagination={false} scroll={{ x: 560 }}
      columns={[
        { title: "Concepto", dataIndex: "concepto", render: (t) => <span className="largo">{t}</span> },
        { title: "Importe", align: "right", render: (_, v) => <span className="cifra">{cop(v.importe)}</span> },
        { title: "Respaldo", render: (_, v) => (v.estado_soporte === "RESPALDADO" ? <Tag color="success">Respaldado</Tag> : <Tag color="warning">Citado en el análisis; acta no disponible</Tag>) },
        { title: "Soporte", render: (_, v) => <SoporteLink soporte={v.soporte} corto /> },
      ]} />
  );
}

export default function DetalleExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idTxt } = use(params);
  const id = Number(idTxt);
  const q = useDetalleExpediente(id);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar el expediente." onReintentar={() => q.refetch()} />;

  const d = q.data;
  const e = d.expediente;
  const pendientesClave = d.analisis_precios.pendientes;

  const h2 = (t: string) => <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>{t}</h2>;
  const items = [
    { key: "precios", label: "Análisis de precios", children: <AnalisisPreciosExpediente d={d} /> },
    { key: "cotizaciones", label: `Cotizaciones y alcance (${d.cotizaciones.length})`, children: <ComparacionCotizaciones d={d} /> },
    { key: "edificios", label: `Edificios y soportes (${d.edificios.length})`, children: <EdificiosSoportes d={d} /> },
    { key: "necesidad", label: "Necesidad y alcance", children: (
      <div style={{ display: "grid", gap: 24 }}>
        <section>{h2("Edificación y condición documentada")}<Lista items={d.necesidad.edificaciones} vacio="Pendiente de soporte: el análisis no identifica la edificación." /></section>
        {d.sectores.length > 0 && <section>{h2("Sectores")}<Lista items={d.sectores} vacio="" /></section>}
        <section>{h2("Actividades requeridas")}<Lista items={d.necesidad.actividades} vacio={PENDIENTE} /></section>
        <section>{h2("Condiciones y particularidades")}<Lista items={d.necesidad.particularidades} vacio={PENDIENTE} /></section>
        <section>{h2("Factores que inciden en el precio")}<Lista items={d.necesidad.factores} vacio={PENDIENTE} /></section>
        {d.necesidad.pendientes_aclaracion.length > 0 && <section>{h2("Pendientes de aclaración según el documento")}<Lista items={d.necesidad.pendientes_aclaracion} vacio="" /></section>}
      </div>) },
    { key: "sector", label: "Análisis del sector", children: (
      <div style={{ display: "grid", gap: 10 }}>
        <p className="texto-secundario" style={{ margin: 0 }}>Referencias de mercado citadas en el análisis. Son valores globales de contratos: no se comparan con precios unitarios.</p>
        {d.analisis_sector.referencias.length === 0 && <Vacio />}
        {d.analisis_sector.referencias.map((r) => (
          <div key={r.id} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}><strong className="largo">{r.entidad}{r.proveedor ? ` · ${r.proveedor}` : ""}</strong><SoporteLink soporte={r.soporte} /></div>
            <div className="largo">{r.objeto}</div>
            <div>Valor del contrato ({r.unidad === "GLOBAL" ? "suma global" : r.unidad}): <strong className="cifra">{cop(r.valor)}</strong>{r.proceso_ref && <span className="texto-secundario"> · Proceso {r.proceso_ref}</span>}</div>
            {r.condiciones && <div className="texto-secundario" style={{ fontSize: 13.5 }}>{r.condiciones}</div>}
            <div style={{ marginTop: 4 }}><ResultadoPct r={r.comparacion} /></div>
          </div>
        ))}
      </div>) },
    { key: "contratacion", label: "Contratación", children: d.contratacion.contratos.length === 0
      ? <Vacio texto={`Oferta seleccionada, justificación, acto o contrato, fecha y valor: ${PENDIENTE}. ${d.contratacion.aviso ?? ""}`} />
      : <div style={{ display: "grid", gap: 10 }}>{d.contratacion.contratos.map((c) => (
          <div key={c.id} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}><strong>{c.tipo_acto}{c.numero ? ` ${c.numero}` : ""}</strong><SoporteLink soporte={c.soporte} /></div>
            <div>Oferta seleccionada: {c.oferta ?? PENDIENTE} · Fecha: {fechaCorta(c.fecha_acto)}</div>
            <div>Valor contratado: <strong className="cifra">{cop(c.valor)}</strong></div>
            <div className="largo">Alcance: {c.alcance ?? PENDIENTE}</div>
            <div className="largo">Justificación documentada: {c.justificacion ?? PENDIENTE}</div>
          </div>))}</div> },
    { key: "ejecucion", label: "Ejecución y soportes", children: (
      <div style={{ display: "grid", gap: 24 }}>
        <section>{h2("Valores ejecutados y actas")}<TablaValores valores={d.ejecucion.valores} /></section>
        <section>
          {h2("Soportes del expediente")}
          {d.soportes.length === 0 ? <Vacio texto="No hay documentos asociados." /> : (
            <Table size="middle" rowKey="documento_id" dataSource={d.soportes} pagination={false} scroll={{ x: 700 }}
              columns={[
                { title: "Nombre", render: (_, s) => <span className="largo">{s.nombre}{s.numero_version ? <span className="texto-secundario"> v{s.numero_version}</span> : null}</span> },
                { title: "Categoría", dataIndex: "categoria_nombre" },
                { title: "Origen", render: (_, s) => (s.origenes.length === 0 ? "—" : [...new Set(s.origenes.map((o) => `${o.tipo === "LOCAL" ? "Local" : "Drive"}${o.estado === "ACTIVO" ? "" : " (retirado)"}`))].map((t) => <Tag key={t}>{t}</Tag>)) },
                { title: "Fecha", render: (_, s) => fechaCorta(s.fecha_documento) },
                { title: "", render: (_, s) => (s.previsualizable && s.version_id ? <Link href={urlVisor(s.version_id)}><Button>Abrir soporte</Button></Link> : <span className="texto-secundario">{s.disponible ? "Sin vista previa para este formato" : "No disponible en ninguna fuente"}</span>) },
              ]} />
          )}
        </section>
      </div>) },
    { key: "comparar", label: "Comparar con otra intervención", children: <ComparadorEntreIntervenciones id={id} /> },
  ];

  return (
    <div>
      <Volver alternativa="/expedientes" texto="Volver" />
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <h1 className="largo" style={{ margin: 0, fontSize: 30, lineHeight: 1.2 }}>{e.intervencion}</h1>
          <Tag color={e.valores.contratado !== null ? "success" : "warning"} style={{ fontSize: 14, padding: "2px 10px" }}>{e.valores.contratado !== null ? "Contrato respaldado" : "Espera documento contractual"}</Tag>
        </div>
        <p className="texto-secundario" style={{ margin: "6px 0 0" }}>
          Proceso <span style={{ fontVariantNumeric: "tabular-nums" }}>{e.proceso}</span> · documento del {fechaCorta(e.fecha_documento)} · {ESTADO_ETQ[e.estado]}
          {e.empresa_seleccionada ? ` · ${e.empresa_seleccionada}` : ""}
        </p>
        {e.objeto && <p className="largo" style={{ margin: "10px 0 0", maxWidth: 980 }}>{e.objeto}</p>}
      </div>

      <div style={{ marginTop: 20 }}><SintesisEconomica d={d} /></div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div><ResultadoTag r={d.analisis_precios.resultado} /></div>
        {(pendientesClave.length > 0 || d.comparacion.diferencias_sin_explicar.length > 0) && (
          <Alert type="warning" showIcon message="Qué falta para concluir"
            description={<ul style={{ margin: 0, paddingLeft: 18 }}>{pendientesClave.map((p) => <li key={p}>{p}</li>)}{d.comparacion.diferencias_sin_explicar.map((x, i) => <li key={`d${i}`}>{x.descripcion}</li>)}</ul>} />
        )}
      </div>

      <Tabs style={{ marginTop: 24 }} defaultActiveKey="precios" items={items} destroyOnHidden={false} />
    </div>
  );
}
