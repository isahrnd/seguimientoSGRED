"use client";
import { BotonEnlace } from "./boton-enlace";
import Link from "next/link";
import { Alert, Button, Tag } from "antd";
import { FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { PENDIENTE, fechaCorta, urlAbrirOriginal } from "@/lib/format";
import type { DetalleExpediente, DocumentoEdificio, ResolucionEdificio } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";

const TONO: Record<string, string> = { VERIFICADA: "success", NO_APLICA: "success", PENDIENTE_SOPORTE: "warning", POR_CONFIRMAR_ALCANCE: "warning", SIN_INTERVENCION: "default" };

export function EstadoResolucion({ r }: { r: ResolucionEdificio | null }) {
  if (!r) return <Tag color="warning">Resolución pendiente de soporte</Tag>;
  return (
    <div>
      <Tag color={TONO[r.requisito] ?? "default"} style={{ whiteSpace: "normal" }}>{r.etiqueta}</Tag>
      {r.resoluciones.map((x) => (
        <div key={x.numero} className="largo" style={{ fontSize: 14, marginTop: 4 }}>
          Resolución <strong style={{ fontVariantNumeric: "tabular-nums" }}>{x.numero}</strong> · {fechaCorta(x.fecha)} · {x.estado_texto}{" "}
          <SoporteLink soporte={x.soporte} />
        </div>
      ))}
    </div>
  );
}

export function FilaDocumento({ nombre, detalle, versionId, disponible = true, extra }: { nombre: string; detalle?: React.ReactNode; versionId: number | null; disponible?: boolean; extra?: React.ReactNode }) {
  const Icono = /\.xlsx?$/i.test(nombre) ? FileExcelOutlined : FilePdfOutlined;
  return (
    <li style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #E6EAF0" }}>
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <div className="largo" style={{ fontWeight: 550 }}><Icono style={{ color: PALETA.tinta, marginRight: 8 }} aria-hidden />{nombre}</div>
        {detalle && <div className="texto-secundario" style={{ fontSize: 13.5 }}>{detalle}</div>}
        {extra}
      </div>
      {versionId && disponible
        ? <BotonEnlace href={urlAbrirOriginal(nombre, versionId)}>Abrir soporte</BotonEnlace>
        : <span className="texto-secundario" style={{ fontSize: 13.5 }}>No disponible en ninguna fuente</span>}
    </li>
  );
}

export function ListaDocumentosEdificio({ docs, ocultarProceso }: { docs: DocumentoEdificio[]; ocultarProceso?: boolean }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {docs.map((x) => (
        <FilaDocumento key={x.documento_id} nombre={x.nombre} versionId={x.version_id} disponible={x.disponible}
          detalle={<>{x.categoria_nombre}{x.fecha_documento ? ` · ${fechaCorta(x.fecha_documento)}` : ""}{x.origen_asociacion === "PROCESO" && " · del proceso (alcance conjunto)"}{x.proceso && <> · <Link href={`/expedientes/${x.proceso.id}`}>{x.proceso.proceso}</Link></>}</>}
          extra={<>
            {x.empresas?.map((e) => <div key={e.nombre} className="largo" style={{ fontSize: 13.5 }}>Empresa: <strong>{e.nombre}</strong>{e.aclaracion && <span className="texto-secundario"> · Aclaración del equipo: {e.aclaracion}</span>}</div>)}
            {x.asociaciones_faltantes.filter((f) => !(ocultarProceso && f === "Proceso contractual")).length > 0 && <div style={{ marginTop: 4 }}>{x.asociaciones_faltantes.filter((f) => !(ocultarProceso && f === "Proceso contractual")).map((f) => <Tag key={f} color="warning" style={{ fontWeight: 400 }}>{f === "Proceso contractual" ? "Proceso contractual pendiente" : `${f} pendiente`}</Tag>)}</div>}
          </>} />
      ))}
    </ul>
  );
}

/** Edificios del proceso con su requisito de resolución y sus documentos. Un solo valor contratado para todo el proceso. */
export function EdificiosSoportes({ d }: { d: DetalleExpediente }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Alert type="info" showIcon message="El valor contratado corresponde al proceso completo y no se divide entre edificios. Los documentos del alcance conjunto cubren varios edificios y se listan una sola vez." />
      {d.edificios.length === 0 && <p className="texto-secundario">{PENDIENTE}: no hay edificios confirmados para este proceso.</p>}
      {d.documentos_por_edificio.map((g, i) => {
        const info = g.edificio ? d.edificios.find((e) => e.id === g.edificio!.id) : null;
        if (!g.edificio && g.documentos.length === 0) return null;
        return (
          <section key={g.edificio?.id ?? `conjunto-${i}`} style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
              <h3 className="largo" style={{ margin: 0, fontSize: 18 }}>{g.edificio ? g.edificio.nombre : "Alcance conjunto (varios edificios)"}</h3>
              {g.edificio && <Link href={`/demoliciones/e${g.edificio.id}`}>Ver ficha de la edificación</Link>}
            </div>
            {g.edificio && <div style={{ marginTop: 8 }}><EstadoResolucion r={info?.resolucion ?? null} /></div>}
            <div style={{ marginTop: 10 }}>
              {g.documentos.length === 0
                ? <span className="texto-secundario">Sin documentos confirmados para este edificio.</span>
                : <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{g.documentos.map((x) => (
                    <FilaDocumento key={x.documento_id} nombre={x.nombre} versionId={x.version_id}
                      detalle={<>{x.categoria_nombre} · {x.origen === "EDIFICIO" ? "vinculado a la edificación" : "del proceso"}</>} />
                  ))}</ul>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
