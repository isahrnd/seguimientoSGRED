"use client";
import { Suspense, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Result } from "antd";
import { ArrowLeftOutlined, ExportOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

/**
 * Visor privado del PDF. El contenido lo entrega la API autorizada por identificador interno de versión
 * (sin rutas ni enlaces públicos); el visor del navegador abre la página citada con #page=.
 */
function Visor({ id }: { id: number }) {
  const router = useRouter();
  const pagina = Number(useSearchParams().get("pagina"));
  const conPagina = Number.isInteger(pagina) && pagina > 0;
  const src = `${api.urlContenido(id)}${conPagina ? `#page=${pagina}` : ""}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100dvh - 150px)", minHeight: 480 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginLeft: -12 }}>Volver</Button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {conPagina && <strong>Página {pagina}</strong>}
          <Button icon={<ExportOutlined />} href={src} target="_blank" rel="noopener noreferrer">Abrir en pestaña nueva</Button>
        </div>
      </div>
      <iframe key={src} src={src} title="Soporte documental" style={{ width: "100%", flex: 1, border: "1px solid #D5DBE5", borderRadius: 8, background: "#fff" }} />
    </div>
  );
}

export default function VisorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const id = Number(versionId);
  if (!Number.isInteger(id) || id < 1) return <Result status="404" title="Documento no válido" />;
  return <Suspense><Visor id={id} /></Suspense>;
}
