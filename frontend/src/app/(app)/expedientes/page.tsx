"use client";

import { Suspense } from "react";
import { Typography } from "antd";
import { ListaExpedientes } from "@/components/expedientes-lista";

export default function Expedientes() {
  return (
    <>
      <Typography.Title level={1} style={{ margin: "0 0 16px", fontSize: 30 }}>Expedientes</Typography.Title>
      <Suspense>
        <ListaExpedientes completo />
      </Suspense>
    </>
  );
}
