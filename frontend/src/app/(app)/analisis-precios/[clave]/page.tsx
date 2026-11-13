"use client";
import { use } from "react";
import { Skeleton } from "antd";
import { useFichaPrecios } from "@/hooks/queries";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { Volver } from "@/components/volver";
import { FichaPreciosEdificio } from "@/components/precios/ficha-precios";
import { BotonPdf } from "@/components/precios/comunes";

/** Ficha de una fila del consolidado que aún no tiene edificio registrado (se muestra con los datos del consolidado y su fuente). */
export default function FichaConsolidadoPage({ params }: { params: Promise<{ clave: string }> }) {
  const { clave } = use(params);
  const q = useFichaPrecios(clave);
  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar la ficha." onReintentar={() => q.refetch()} />;
  const f = q.data.fila;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Volver alternativa="/analisis-precios" texto="Volver" />
          <h1 className="largo" style={{ margin: "6px 0 0", fontSize: 30 }}>{f.nombre}</h1>
          {f.direccion && <p className="texto-secundario largo" style={{ margin: "4px 0 0" }}>{f.direccion}</p>}
        </div>
        <BotonPdf href={`/api/monitoreo-contratacion/exportar/pdf/edificio/${clave}`} />
      </div>
      <FichaPreciosEdificio ficha={q.data} />
    </div>
  );
}
