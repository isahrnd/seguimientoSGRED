"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Result, Skeleton } from "antd";
import { ArrowLeftOutlined, ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

type Estado = { tipo: "comprobando" } | { tipo: "listo" } | { tipo: "error"; status: number };

/**
 * Visor privado del PDF. El contenido lo entrega la API autorizada por identificador interno de versión
 * (sin rutas ni enlaces públicos). Antes de mostrarlo se comprueba la fuente: 503 es una falla pasajera
 * (reintentable) y 410 significa que el archivo ya no está o cambió.
 */
function Visor({ id }: { id: number }) {
  const router = useRouter();
  const pagina = Number(useSearchParams().get("pagina"));
  const conPagina = Number.isInteger(pagina) && pagina > 0;
  const base = api.urlContenido(id);
  const src = `${base}${conPagina ? `#page=${pagina}` : ""}`;
  const [estado, setEstado] = useState<Estado>({ tipo: "comprobando" });

  const comprobar = useCallback(async () => {
    setEstado({ tipo: "comprobando" });
    try {
      const r = await fetch(base, { headers: { Range: "bytes=0-0" }, credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { location.assign(`/login?volver=${encodeURIComponent(location.pathname + location.search)}`); return; }
      setEstado(r.ok ? { tipo: "listo" } : { tipo: "error", status: r.status });
    } catch {
      setEstado({ tipo: "error", status: 503 });
    }
  }, [base]);

  useEffect(() => { void comprobar(); }, [comprobar]);

  const mensaje = (s: number) =>
    s === 503 ? "La fuente del documento no respondió. Suele resolverse sola: intente de nuevo en unos segundos."
      : s === 410 ? "El archivo ya no está en una fuente autorizada o cambió. Actualice el índice para ver su versión vigente."
      : s === 415 ? "Este documento no tiene vista previa en PDF."
      : s === 403 ? "Su cuenta no tiene permiso para ver este documento."
      : "No fue posible abrir el documento.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "calc(100dvh - 150px)", minHeight: 480 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginLeft: -12 }}>Volver</Button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {conPagina && <strong>Página {pagina}</strong>}
          <Button icon={<ExportOutlined />} href={src} target="_blank" rel="noopener noreferrer">Abrir en pestaña nueva</Button>
        </div>
      </div>
      {estado.tipo === "comprobando" && <Skeleton active paragraph={{ rows: 6 }} />}
      {estado.tipo === "error" && (
        <Alert type={estado.status === 503 ? "warning" : "error"} showIcon message={mensaje(estado.status)}
          action={estado.status === 503 ? <Button icon={<ReloadOutlined />} onClick={comprobar}>Reintentar</Button> : undefined} />
      )}
      {estado.tipo === "listo" && (
        <iframe key={src} src={src} title="Soporte documental" style={{ width: "100%", flex: 1, border: "1px solid #D5DBE5", borderRadius: 8, background: "#fff" }} />
      )}
    </div>
  );
}

export default function VisorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const id = Number(versionId);
  if (!Number.isInteger(id) || id < 1) return <Result status="404" title="Documento no válido" />;
  return <Suspense><Visor id={id} /></Suspense>;
}
