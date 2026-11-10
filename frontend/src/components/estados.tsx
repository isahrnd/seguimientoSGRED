"use client";
import { Alert, Button, Empty, Result, Skeleton } from "antd";
import { LockOutlined } from "@ant-design/icons";

export function SinAcceso() {
  return <Result icon={<LockOutlined />} title="Sin acceso" subTitle="Esta cuenta no tiene permiso para consultar este contenido." />;
}

export function Cargando() {
  return <Skeleton active paragraph={{ rows: 8 }} />;
}

export function ErrorCarga({ texto, onReintentar }: { texto: string; onReintentar?: () => void }) {
  return <Alert type="error" showIcon message={texto} action={onReintentar ? <Button onClick={onReintentar}>Reintentar</Button> : undefined} />;
}

export function Vacio({ texto }: { texto: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={texto} />;
}

/** Aviso que sí afecta una decisión: pendiente, desactualizado, no comparable o cifra cambiada. */
export function Aviso({ tipo = "warning", titulo, children }: { tipo?: "warning" | "info" | "error"; titulo: React.ReactNode; children?: React.ReactNode }) {
  return <Alert type={tipo} showIcon message={titulo} description={children} role={tipo === "error" ? "alert" : "note"} />;
}
