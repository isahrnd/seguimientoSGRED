"use client";
import type { ReactNode } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";

/** Etiqueta compacta y de colores suaves para un trámite pendiente (no es una advertencia): reserva el estilo de advertencia para lo que requiere atención. */
export function EtiquetaInformativa({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF3F9", border: "1px solid #C9D8E8", color: "#2A4A6B", borderRadius: 6, padding: "2px 9px", fontSize: 13, lineHeight: 1.4 }}>
      <InfoCircleOutlined aria-hidden /> <span>{children}</span>
    </span>
  );
}
