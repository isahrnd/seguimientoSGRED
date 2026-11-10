"use client";

import { Suspense } from "react";
import { Button, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { ListaExpedientes } from "@/components/expedientes-lista";

export default function Expedientes() {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 16px" }}>
        <Typography.Title level={1} style={{ margin: 0, fontSize: 30 }}>Expedientes</Typography.Title>
        <Button href="/api/monitoreo-contratacion/exportar/resumen-contratos" icon={<DownloadOutlined />} aria-label="Exportar resumen por contrato (Excel)">
          Exportar resumen por contrato
        </Button>
      </div>
      <Suspense>
        <ListaExpedientes completo />
      </Suspense>
    </>
  );
}
