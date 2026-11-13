"use client";
import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "antd";
import { FileTextOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useDetalleExpediente } from "@/hooks/queries";
import { cop, etiquetaProceso, fechaCorta } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { Volver } from "@/components/volver";
import { BotonEnlace } from "@/components/boton-enlace";
import { urlVisor } from "@/components/soporte-link";

/**
 * Enlace antiguo de un expediente: si cubre un solo edificio registrado lleva a SU ficha; si cubre varios, muestra un resumen compacto del
 * contrato con los edificios relacionados (sin elegir uno). El detalle técnico completo está en la gestión documental.
 */
export default function ResumenContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idTxt } = use(params);
  const id = Number(idTxt);
  const router = useRouter();
  const q = useDetalleExpediente(id);
  const d = q.data;
  const unico = d && d.edificios.length === 1 ? d.edificios[0] : null;
  useEffect(() => { if (unico) router.replace(`/demoliciones/e${unico.id}`); }, [unico, router]);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading || unico) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (q.isError || !d) return <ErrorCarga texto="No fue posible cargar el contrato." onReintentar={() => q.refetch()} />;

  const e = d.expediente;
  const contrato = d.contratacion.contratos[0] ?? null;
  const soporte = contrato?.soporte ?? null;
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1100 }}>
      <div>
        <Volver alternativa="/" texto="Demoliciones" />
        <p className="texto-secundario" style={{ margin: "6px 0 0", fontSize: 14.5 }}>Resumen del contrato</p>
        <h1 className="largo" style={{ margin: "2px 0 0", fontSize: 30, lineHeight: 1.2, color: "#1B3A6B" }}>{etiquetaProceso(e)}</h1>
        <p className="texto-secundario largo" style={{ margin: "6px 0 0", fontSize: 16 }}>{e.intervencion}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <Dato etiqueta="Valor del contrato" valor={contrato ? cop(contrato.valor) : "Por incorporar"} detalle={contrato ? (contrato.expresion_valor ?? "Valor contratado") : "El contrato aún no está incorporado"} />
        <Dato etiqueta="Contratista" valor={<span style={{ fontSize: 22 }}>{contrato?.contratista ?? e.empresa_seleccionada ?? "Por identificar"}</span>} detalle={contrato?.fecha_acto ? `Suscrito el ${fechaCorta(contrato.fecha_acto)}` : "Fecha por documentar"} />
        <Dato etiqueta="Edificios" valor={String(d.edificios.length)} detalle={d.edificios.length > 1 ? "El valor corresponde a todos; no se reparte" : "Sin edificios registrados aún"} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {soporte && <BotonEnlace type="primary" size="large" icon={<FileTextOutlined aria-hidden />} href={urlVisor(soporte.version_id, soporte.pagina)}>Ver contrato</BotonEnlace>}
        <BotonEnlace size="large" icon={<FolderOpenOutlined aria-hidden />} href={`/documentos/trazabilidad/expediente/${id}`}>Trazabilidad y gestión</BotonEnlace>
      </div>

      <section aria-labelledby="sec-edificios">
        <h2 id="sec-edificios" style={{ fontSize: 20, margin: "0 0 10px", color: "#1B3A6B" }}>Edificios relacionados</h2>
        {d.edificios.length === 0 ? <p className="texto-secundario" style={{ margin: 0 }}>Aún no hay edificios registrados para este contrato.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {d.edificios.map((b) => (
              <li key={b.id} style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: "12px 16px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                <span className="largo"><strong>{b.nombre}</strong>{b.direccion ? <span className="texto-secundario"> · {b.direccion}</span> : null}</span>
                <Link href={`/demoliciones/e${b.id}`} style={{ fontWeight: 600 }}>Ver detalle</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: React.ReactNode; detalle: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #D5DBE5", borderRadius: 10, padding: "16px 20px", minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#4A5568", textTransform: "uppercase", letterSpacing: 0.3 }}>{etiqueta}</div>
      <div className="cifra" style={{ fontSize: 28, fontWeight: 700, color: "#1B3A6B", margin: "6px 0 4px", lineHeight: 1.15, whiteSpace: "normal" }}>{valor}</div>
      <div className="texto-secundario" style={{ fontSize: 14.5 }}>{detalle}</div>
    </div>
  );
}
