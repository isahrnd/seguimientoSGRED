"use client";
import Link from "next/link";
import { Alert, Table, Tag } from "antd";
import { ACTIVIDAD_ETQ, BASE_ETQ, PENDIENTE, SELECCION_ETQ, cantidadConUnidad, cop, fechaCorta, precioConUnidad, urlHoja } from "@/lib/format";
import type { Comparacion, DetalleExpediente, LineaPrecio } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink, urlVisor } from "./soporte-link";

export function ResultadoPct({ r }: { r: Comparacion }) {
  return r.comparable
    ? <Tag color="blue" className="cifra">{(r.diferencia_pct ?? 0) > 0 ? "+" : ""}{r.diferencia_pct?.toLocaleString("es-CO")} %</Tag>
    : <span className="texto-secundario" style={{ fontSize: 13.5 }}>No comparable: {r.motivo}</span>;
}

export function TablaLineas({ lineas }: { lineas: LineaPrecio[] }) {
  if (lineas.length === 0) return <p className="texto-secundario">{PENDIENTE}: no hay actividades ni cantidades registradas.</p>;
  return (
    <Table<LineaPrecio>
      size="middle"
      rowKey="id"
      dataSource={lineas}
      pagination={false}
      scroll={{ x: 820 }}
      columns={[
        { title: "Actividad", key: "a", render: (_, l) => (
          <div className="largo" style={{ minWidth: 240 }}>
            {l.descripcion}
            <div className="texto-secundario" style={{ fontSize: 13 }}>{ACTIVIDAD_ETQ[l.actividad] ?? l.actividad}</div>
            {l.nota && <div className="texto-secundario" style={{ fontSize: 13 }}>{l.nota}</div>}
            {l.estado_revision !== "VERIFICADO" && <Tag color="warning" style={{ marginTop: 4 }}>Pendiente de revisión</Tag>}
          </div>) },
        { title: "Cantidad", align: "right", key: "c", render: (_, l) => <span className="cifra">{cantidadConUnidad(l.cantidad, l.unidad)}</span> },
        { title: "Precio unitario", align: "right", key: "p", render: (_, l) => <span className="cifra">{l.unidad === "GLOBAL" ? "—" : precioConUnidad(l.precio_unitario, l.unidad)}</span> },
        { title: "Total", align: "right", key: "t", render: (_, l) => <span className="cifra">{l.total !== null ? cop(l.total) : "—"}</span> },
        { title: "Base económica", key: "b", render: (_, l) => <>{BASE_ETQ[l.base_economica] ?? l.base_economica}{l.derivado && <div className="texto-secundario" style={{ fontSize: 12.5 }}>calculado a partir de la fuente</div>}</> },
        { title: "Soporte", key: "s", render: (_, l) => <SoporteLink soporte={l.soporte} corto /> },
      ]}
    />
  );
}

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} style={{ fontSize: 18, margin: "0 0 10px" }}>{children}</h2>;

export function ComparacionCotizaciones({ d }: { d: DetalleExpediente }) {
  const c = d.comparacion;
  const resumenDe = (clave: string) => c.cotizaciones_resumen.find((x) => x.clave === clave);
  // Revisiones de una misma oferta se agrupan; ofertas de empresas distintas quedan separadas.
  const porEmpresa = new Map<string, typeof d.cotizaciones>();
  for (const o of d.cotizaciones) porEmpresa.set(o.proveedor, [...(porEmpresa.get(o.proveedor) ?? []), o]);

  return (
    <div style={{ display: "grid", gap: 32 }}>
      {c.alertas_cifra.length > 0 && (
        <section aria-label="Cifras por revisar" style={{ display: "grid", gap: 8 }}>
          {c.alertas_cifra.map((a) => (
            <Alert key={a.id} type="warning" showIcon role="alert"
              message={<strong>Cifra por revisar</strong>}
              description={<>
                {a.hoja === "PDF"
                  ? <>El PDF que respalda la cifra “{a.clave}” cambió en una versión nueva; verifique {a.celda}.</>
                  : <>La celda {a.celda} (hoja {a.hoja}) que respalda la cifra “{a.clave}” cambió de {a.valor_anterior ?? "vacío"} a {a.valor_nuevo ?? "vacío"} en una versión nueva.</>}
                {" "}
                <Link href={a.hoja === "PDF" ? urlVisor(a.version_anterior_id) : urlHoja(a.version_anterior_id, a.hoja, a.celda)}>Ver versión anterior</Link>
                {" · "}
                <Link href={a.hoja === "PDF" ? urlVisor(a.version_nueva_id) : urlHoja(a.version_nueva_id, a.hoja, a.celda)}>Ver versión nueva</Link>
              </>} />
          ))}
        </section>
      )}

      <section aria-labelledby="alcance-ofertas">
        <H2 id="alcance-ofertas">Alcance de las ofertas</H2>
        {c.alcance.hay_diferencias ? (
          <Alert type="warning" showIcon role="note" message={c.alcance.aviso}
            description={<ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{c.alcance.diferencias.map((x) => <li key={x.concepto}><strong>{x.concepto}:</strong> la incluyen {x.incluyen.join(", ")}; no la incluyen {x.no_incluyen.join(", ")}.</li>)}</ul>} />
        ) : c.alcance.aviso ? (
          <Alert type="info" showIcon message={c.alcance.aviso} />
        ) : c.alcance.comparables ? (
          <p className="texto-secundario">No se detectaron diferencias de alcance entre las ofertas documentadas.</p>
        ) : (
          <p className="texto-secundario">{PENDIENTE}: hace falta más de una oferta para comparar el alcance.</p>
        )}
      </section>

      <section aria-labelledby="cotizaciones-prov">
        <H2 id="cotizaciones-prov">Cotizaciones por empresa</H2>
        {d.cotizaciones.length === 0 && <p className="texto-secundario">{PENDIENTE}: no hay cotizaciones registradas.</p>}
        <div style={{ display: "grid", gap: 16 }}>
          {[...porEmpresa.entries()].map(([empresa, ofertas]) => (
            <div key={empresa} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 18 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <h3 className="largo" style={{ margin: 0, fontSize: 18 }}>{empresa}</h3>
                {ofertas.some((o) => resumenDe(o.clave)?.es_seleccionada) && <Tag color="success">Oferta seleccionada</Tag>}
                {ofertas.length > 1 && <Tag>{ofertas.length} revisiones de la misma oferta</Tag>}
              </div>
              {ofertas.map((o) => {
                const r = resumenDe(o.clave);
                return (
                  <div key={o.id} style={{ marginTop: 14, paddingTop: 14, borderTop: ofertas.length > 1 ? `1px solid #E6EAF0` : undefined }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
                      {ofertas.length > 1 && <Tag color="blue">Revisión {o.revision}</Tag>}
                      <span>Fecha: {fechaCorta(o.fecha_oferta)}</span>
                      <span>Valor cotizado: {r && r.valor_cotizado.length > 0 ? r.valor_cotizado.map((v, k) => <span key={k} style={{ marginRight: 10 }}><strong className="cifra">{cop(v.importe)}</strong> <SoporteLink soporte={v.soporte} corto /></span>) : <span className="texto-secundario">{PENDIENTE}</span>}</span>
                      <SoporteLink soporte={o.soporte} />
                    </div>
                    <div style={{ marginTop: 12 }}><TablaLineas lineas={o.lineas} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 12 }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>Edificación o alcance que incluye</strong>
                        {o.incluye.length ? <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{o.incluye.map((x) => <li key={x}>{x}</li>)}</ul> : <div className="texto-secundario">{PENDIENTE}</div>}
                      </div>
                      <div>
                        <strong style={{ fontSize: 14 }}>Condiciones y exclusiones</strong>
                        {o.excluye.length || r?.condiciones ? <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{o.excluye.map((x) => <li key={x}>{x}</li>)}{r?.condiciones && <li>{r.condiciones}</li>}</ul> : <div className="texto-secundario">{PENDIENTE}</div>}
                      </div>
                    </div>
                    {o.notas && <p className="texto-secundario" style={{ fontSize: 13.5, marginBottom: 0 }}>{o.notas}</p>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {d.comparaciones_entre_ofertas.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <strong>Diferencias porcentuales entre ofertas</strong>
            {c.alcance.hay_diferencias && <p style={{ color: PALETA.ambar, fontSize: 13.5, margin: "4px 0" }}>Interprete estos porcentajes teniendo en cuenta las diferencias de alcance señaladas arriba.</p>}
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{d.comparaciones_entre_ofertas.map((x, i) => <li key={i}>{x.a} ↔ {x.b} <ResultadoPct r={x} /></li>)}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby="seleccion">
        <H2 id="seleccion">Selección y justificación</H2>
        <Tag color={c.seleccion.estado === "ADJUDICADA" ? "success" : "warning"} style={{ whiteSpace: "normal", fontSize: 14 }}>{SELECCION_ETQ[c.seleccion.estado]}</Tag>
        {c.seleccion.oferta && <span style={{ marginLeft: 8 }}>Oferta: <strong>{c.seleccion.oferta}</strong></span>}
        {c.seleccion.texto && <p className="texto-secundario">{c.seleccion.texto}</p>}
        {c.seleccion.justificaciones.map((j, i) => <p key={i} className="largo"><strong>Justificación documentada:</strong> {j.texto} <SoporteLink soporte={j.soporte} /></p>)}
        {c.seleccion.contratos.map((k, i) => <p key={i} className="largo"><strong>Justificación en el contrato{k.numero ? ` ${k.numero}` : ""}:</strong> {k.justificacion} <SoporteLink soporte={k.soporte} /></p>)}
      </section>

      <section aria-labelledby="estudio-mercado">
        <H2 id="estudio-mercado">Estudio de mercado</H2>
        <Tag color={c.estudio_mercado.estado === "RECIBIDO" ? "success" : "warning"}>{c.estudio_mercado.etiqueta}</Tag>
        {c.estudio_mercado.documentos.map((x) => <div key={x.documento_id} style={{ marginTop: 6 }}>{x.version_id ? <Link href={urlVisor(x.version_id)}>{x.nombre}</Link> : x.nombre}</div>)}
        <p className="texto-secundario" style={{ fontSize: 13.5 }}>{c.estudio_mercado.aviso}</p>
        {c.estudio_mercado.analisis_del_sector.length > 0 && (
          <p className="texto-secundario" style={{ fontSize: 13.5 }}>Análisis del sector cargado (documento distinto):{" "}
            {c.estudio_mercado.analisis_del_sector.map((x, i) => <span key={x.documento_id}>{i > 0 && ", "}{x.version_id ? <Link href={urlVisor(x.version_id)}>{x.nombre}</Link> : x.nombre}</span>)}
          </p>
        )}
      </section>

      <section aria-labelledby="sin-explicar">
        <H2 id="sin-explicar">Diferencias que los documentos aún no explican</H2>
        {c.diferencias_sin_explicar.length === 0
          ? <p className="texto-secundario">No hay diferencias sin explicar registradas con los soportes disponibles. Esto no equivale a una conclusión sobre el costo: verifique cada fuente.</p>
          : <ul style={{ margin: 0, paddingLeft: 18 }}>{c.diferencias_sin_explicar.map((x, i) => <li key={i}>{x.descripcion}</li>)}</ul>}
      </section>

      {c.comparativo_general.length > 0 && (
        <section aria-labelledby="comparativo-general">
          <H2 id="comparativo-general">Comparativo general: filas de este caso</H2>
          <p className="texto-secundario" style={{ fontSize: 13.5 }}>Referencias a hojas y celdas del cuadro general; sus importes no se suman a los valores del expediente.</p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {c.comparativo_general.map((f) => (
              <li key={f.clave} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}><strong className="largo">{f.titulo}</strong><SoporteLink soporte={f.soporte} /></div>
                {f.detalle && <div className="texto-secundario">{f.detalle}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
