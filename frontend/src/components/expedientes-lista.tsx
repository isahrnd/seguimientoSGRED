"use client";
import { BotonEnlace } from "./boton-enlace";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, DatePicker, Empty, Grid, Input, Segmented, Select, Skeleton, Table, Tag, Typography } from "antd";
import { ArrowRightOutlined, ClockCircleOutlined, SafetyCertificateOutlined, SearchOutlined } from "@ant-design/icons";
import { useEdificios, useExpedientes } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { ESTADO_ETQ, PENDIENTE, cop, etiquetaProceso, fechaCorta } from "@/lib/format";
import type { ExpedienteFila } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SinAcceso } from "./estados";
import { esErrorDeAcceso } from "@/lib/api";
import dayjs from "dayjs";

const CLAVES = ["q", "vista", "intervencion", "empresa", "estado", "desde", "hasta"] as const;

export interface CifraPrincipal {
  etiqueta: "Contrato" | "Ejecución" | "Cotización" | "Presupuesto oficial" | "Sin cifra";
  texto: string;
  respaldada: boolean;
}

/** La cifra principal de un expediente y qué representa: nunca un total que mezcle conceptos ni un $0 por ausencia. */
export function cifraPrincipal(e: ExpedienteFila): CifraPrincipal {
  const v = e.valores;
  if (v.contratado !== null) return { etiqueta: "Contrato", texto: cop(v.contratado), respaldada: true };
  if (v.ejecutado !== null) return { etiqueta: "Ejecución", texto: cop(v.ejecutado), respaldada: true };
  if (v.cotizado) return { etiqueta: "Cotización", texto: v.cotizado.min === v.cotizado.max ? cop(v.cotizado.max) : `${cop(v.cotizado.min)} – ${cop(v.cotizado.max)}`, respaldada: false };
  if (v.presupuesto_oficial !== null) return { etiqueta: "Presupuesto oficial", texto: cop(v.presupuesto_oficial), respaldada: false };
  return { etiqueta: "Sin cifra", texto: PENDIENTE, respaldada: false };
}

export const tieneContrato = (e: ExpedienteFila) => e.valores.contratado !== null;

export function EstadoExpediente({ e }: { e: ExpedienteFila }) {
  if (tieneContrato(e)) return <Tag color="success" icon={<SafetyCertificateOutlined />}>Contrato respaldado</Tag>;
  return <Tag color="warning" icon={<ClockCircleOutlined />}>Espera documento contractual</Tag>;
}

function Cifra({ e }: { e: ExpedienteFila }) {
  const c = cifraPrincipal(e);
  return (
    <div style={{ textAlign: "right" }}>
      <div className="texto-secundario" style={{ fontSize: 13, fontWeight: 600 }}>{c.etiqueta}</div>
      <div className="cifra" style={{ fontSize: 20, fontWeight: 700, color: c.respaldada ? PALETA.petroleo : PALETA.texto }}>{c.texto}</div>
    </div>
  );
}

function Alcance({ e }: { e: ExpedienteFila }) {
  const sitios = [...e.edificaciones, ...(e.sectores ?? [])];
  return (
    <div className="largo">
      <div style={{ fontWeight: 600, fontSize: 16 }}>{e.intervencion}</div>
      <div className="texto-secundario" style={{ fontSize: 13.5 }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{etiquetaProceso(e)}</span>
        {sitios.length > 0 && <> · {sitios.slice(0, 3).join(", ")}{sitios.length > 3 ? ` y ${sitios.length - 3} más` : ""}</>}
      </div>
    </div>
  );
}

export function ListaExpedientes({ completo }: { completo: boolean }) {
  const { valores, cambiar } = useUrlState(CLAVES);
  const [texto, setTexto] = useState(valores.q);
  const pantallas = Grid.useBreakpoint();
  const movil = !pantallas.md;

  // La búsqueda se envía a la URL con una breve espera: se puede escribir letra por letra sin perder el foco.
  useEffect(() => {
    if (texto === valores.q) return;
    const t = setTimeout(() => cambiar({ q: texto }), 250);
    return () => clearTimeout(t);
  }, [texto, valores.q, cambiar]);
  useEffect(() => { setTexto(valores.q); /* «Atrás» cambia la URL */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores.q]);

  const filtros = completo
    ? { q: valores.q, intervencion: valores.intervencion, empresa: valores.empresa, estado: valores.estado, desde: valores.desde, hasta: valores.hasta }
    : { q: valores.q };
  const query = useExpedientes(filtros);
  const todas = useExpedientes(completo ? {} : { q: "" });
  const datos = query.data;
  const edificios = useEdificios(!completo ? valores.q : "");
  const edifCoinciden = !completo && valores.q ? (edificios.data?.edificios ?? []) : [];

  const filas = useMemo(() => {
    let f = [...(datos?.expedientes ?? [])];
    if (!completo) {
      if (valores.vista === "contrato") f = f.filter(tieneContrato);
      if (valores.vista === "espera") f = f.filter((e) => !tieneContrato(e));
      f.sort((a, b) => Number(tieneContrato(b)) - Number(tieneContrato(a)));
    }
    return f;
  }, [datos, completo, valores.vista]);

  useScrollRestore(`lista:${completo ? "exp" : "inicio"}:${JSON.stringify(valores)}`, !!datos);

  if (query.isError && esErrorDeAcceso(query.error)) return <SinAcceso />;

  const total = datos?.expedientes.length ?? 0;
  const conContrato = (datos?.expedientes ?? []).filter(tieneContrato).length;
  const empresas = [...new Set((todas.data?.expedientes ?? []).flatMap((e) => e.ofertas_analizadas))].sort();

  return (
    <div>
      <Input
        size="large"
        allowClear
        autoFocus={!completo}
        prefix={<SearchOutlined />}
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        placeholder="Buscar por edificio, empresa o proceso"
        aria-label="Buscar por edificio, empresa o proceso"
        style={{ height: 56, fontSize: 18, maxWidth: 760 }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16 }}>
        {!completo ? (
          <Segmented
            value={valores.vista || "todos"}
            onChange={(v) => cambiar({ vista: v === "todos" ? "" : String(v) })}
            options={[
              { label: "Todos", value: "todos" },
              { label: "Con contrato respaldado", value: "contrato" },
              { label: "Esperan documento contractual", value: "espera" },
            ]}
          />
        ) : (
          <>
            <Select allowClear placeholder="Estado" style={{ minWidth: 220 }} value={valores.estado || undefined} onChange={(v) => cambiar({ estado: v ?? "" })}
              options={Object.entries(ESTADO_ETQ).map(([value, label]) => ({ value, label }))} aria-label="Filtrar por estado" />
            <Select allowClear showSearch placeholder="Empresa" style={{ minWidth: 220 }} value={valores.empresa || undefined} onChange={(v) => cambiar({ empresa: v ?? "" })}
              options={empresas.map((x) => ({ value: x, label: x }))} aria-label="Filtrar por empresa" />
            <Input allowClear placeholder="Tipo de intervención" style={{ width: 220 }} value={valores.intervencion} onChange={(ev) => cambiar({ intervencion: ev.target.value })} aria-label="Filtrar por intervención" />
            <DatePicker.RangePicker
              format="DD/MM/YYYY"
              value={[valores.desde ? dayjs(valores.desde) : null, valores.hasta ? dayjs(valores.hasta) : null]}
              onChange={(r) => cambiar({ desde: r?.[0]?.format("YYYY-MM-DD") ?? "", hasta: r?.[1]?.format("YYYY-MM-DD") ?? "" })}
              placeholder={["Desde", "Hasta"]}
            />
            {(valores.estado || valores.empresa || valores.intervencion || valores.desde || valores.hasta) && (
              <Button type="link" onClick={() => cambiar({ estado: "", empresa: "", intervencion: "", desde: "", hasta: "" })}>Quitar filtros</Button>
            )}
          </>
        )}
        <Typography.Text type="secondary" style={{ marginLeft: "auto" }} aria-live="polite">
          {query.isFetching && !datos ? "Buscando…" : `${total} ${total === 1 ? "expediente" : "expedientes"}${valores.q ? ` para “${valores.q}”` : ""}`}
        </Typography.Text>
      </div>

      {datos && conContrato === 0 && !valores.q && !valores.estado && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="Ningún expediente tiene todavía un valor contratado acreditado."
          description={<>Hasta que llegue el contrato o el acto de adjudicación se muestran presupuestos y cotizaciones, cada uno con su etiqueta. <Link href="/analisis-precios">Ver ofertas y comparaciones disponibles</Link>.</>}
        />
      )}

      {edifCoinciden.length > 0 && (
        <section aria-label="Edificaciones que coinciden" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Edificaciones que coinciden</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {edifCoinciden.map((b) => (
              <li key={b.id} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div className="largo">
                  <strong style={{ fontSize: 16 }}>{b.nombre}</strong>
                  <div className="texto-secundario" style={{ fontSize: 13.5 }}>{b.direccion ? `${b.direccion} · ` : ""}{b.documentos} documentos · {b.resolucion.etiqueta}{b.procesos.length === 0 ? " · proceso contractual pendiente" : ""}</div>
                </div>
                <BotonEnlace href={`/edificaciones/${b.id}`} type="primary" icon={<ArrowRightOutlined />} iconPosition="end">Abrir ficha</BotonEnlace>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ marginTop: 16 }}>
        {query.isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : query.isError ? (
          <Alert type="error" showIcon message="No fue posible cargar los expedientes." action={<Button onClick={() => query.refetch()}>Reintentar</Button>} />
        ) : filas.length === 0 && edifCoinciden.length > 0 ? null : filas.length === 0 ? (
          <Empty description={valores.q ? `Ningún expediente coincide con “${valores.q}”.` : "No hay expedientes con este filtro."} />
        ) : movil ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {filas.map((e) => (
              <li key={e.id} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: 14 }}>
                <Alcance e={e} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <EstadoExpediente e={e} />
                  <Cifra e={e} />
                </div>
                <BotonEnlace href={`/expedientes/${e.id}`} block style={{ marginTop: 10 }} type="primary">Abrir expediente</BotonEnlace>
              </li>
            ))}
          </ul>
        ) : (
          <Table<ExpedienteFila>
            rowKey="id"
            dataSource={filas}
            pagination={false}
            tableLayout="auto"
            onRow={(e) => ({ onDoubleClick: () => { location.assign(`/expedientes/${e.id}`); } })}
            columns={[
              { title: "Intervención", key: "i", render: (_, e) => <Alcance e={e} />, width: "38%" },
              { title: "Empresa", key: "emp", responsive: ["lg"], width: 220, render: (_, e) => <span className="largo">{e.empresa_seleccionada ?? (e.ofertas_analizadas.length ? <span className="texto-secundario">{e.ofertas_analizadas.length === 1 ? `Cotiza: ${e.ofertas_analizadas[0]}` : `${e.ofertas_analizadas.length} empresas cotizan`}</span> : <span className="texto-secundario">—</span>)}</span> },
              { title: "Estado", key: "s", render: (_, e) => <EstadoExpediente e={e} /> },
              { title: "Documento", dataIndex: "fecha_documento", key: "f", responsive: ["xl"], render: (f) => fechaCorta(f) },
              { title: <div style={{ textAlign: "right" }}>Cifra principal</div>, key: "c", align: "right", render: (_, e) => <Cifra e={e} /> },
              { title: "", key: "a", width: 120, render: (_, e) => <BotonEnlace href={`/expedientes/${e.id}`} type="primary" icon={<ArrowRightOutlined />} iconPosition="end">Abrir</BotonEnlace> },
            ]}
          />
        )}
      </div>
    </div>
  );
}
