"use client";
import { use } from "react";
import { Skeleton } from "antd";
import { useFichaPrecios } from "@/hooks/queries";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { Volver } from "@/components/volver";
import { FichaEjecutiva } from "@/components/precios/ficha-precios";

/** Ficha única de un edificio (registrado `e<ID>` o fila del consolidado `c<ID>`): la misma para toda entrada, nueva o antigua. */
export default function FichaDemolicionPage({ params }: { params: Promise<{ clave: string }> }) {
  const { clave } = use(params);
  const valida = /^[ec]\d{1,6}$/.test(clave);
  const q = useFichaPrecios(valida ? clave : "");
  if (!valida) return <ErrorCarga texto="No encontramos ese edificio." />;
  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar la ficha del edificio." onReintentar={() => q.refetch()} />;
  return (
    <div>
      <Volver alternativa="/" texto="Demoliciones" />
      <div style={{ marginTop: 6 }}><FichaEjecutiva ficha={q.data} clave={clave} /></div>
    </div>
  );
}
