"use client";

import { Suspense } from "react";
import { Typography } from "antd";
import { ListaExpedientes } from "@/components/expedientes-lista";

export default function Inicio() {
  return (
    <>
      <Typography.Title level={1} style={{ margin: "0 0 16px", fontSize: 32 }}>Contratación de demoliciones</Typography.Title>
      <Suspense>
        <ListaExpedientes completo={false} />
      </Suspense>
    </>
  );
}
