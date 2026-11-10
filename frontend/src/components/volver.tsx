"use client";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

/** Regresa a la pantalla anterior real (con sus filtros y posición); sin historial, va a la lista indicada. */
export function Volver({ alternativa, texto }: { alternativa: string; texto: string }) {
  const router = useRouter();
  return (
    <Button type="text" icon={<ArrowLeftOutlined />} style={{ marginLeft: -12 }}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(alternativa))}>{texto}</Button>
  );
}
