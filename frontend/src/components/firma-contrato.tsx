"use client";
import { Tag } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { fechaCorta } from "@/lib/format";
import type { DetalleExpediente } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";

type Contrato = DetalleExpediente["contratacion"]["contratos"][number];

/**
 * Evidencia de firma del contrato, dicha con exactitud: qué consta en el PDF y qué falta.
 * El valor del contrato se muestra de todos modos con su documento; esta etiqueta no lo oculta.
 */
export function FirmaContrato({ c, detalle = true }: { c: Contrato; detalle?: boolean }) {
  if (!c.firma_estado) return null;
  const ok = c.firma_estado === "FIRMADO_ELECTRONICAMENTE";
  const faltaFecha = ok && !c.firma_fecha;
  return (
    <div style={{ fontSize: 13, marginTop: 4 }}>
      <Tag color={ok ? "success" : "warning"} icon={ok ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />} style={{ whiteSpace: "normal" }}>
        {c.firma_estado === "FIRMADO_ELECTRONICAMENTE" ? "Firmado electrónicamente por ambas partes" : c.firma_estado === "FIRMA_PARCIAL" ? "Firma de una sola parte" : "Sin evidencia de firma"}
        {c.firma_fecha ? ` · ${fechaCorta(c.firma_fecha)}` : ""}
      </Tag>
      {detalle && c.firma_detalle && <div className="texto-secundario largo" style={{ marginTop: 2 }}>{c.firma_detalle}</div>}
      {faltaFecha && !detalle && <div style={{ color: PALETA.ambar }}>Falta la fecha de suscripción (SECOP II)</div>}
    </div>
  );
}
