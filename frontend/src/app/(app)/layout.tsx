import { redirect } from "next/navigation";
import { Result } from "antd";
import { Shell } from "@/components/shell";
import { sesionServidor } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await sesionServidor();
  if (s === "sin-servicio") {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <Result status="error" title="El servicio no responde" subTitle="No fue posible conectar con la API. Los datos no se han modificado; intente de nuevo en unos minutos." extra={<a href="">Reintentar</a>} />
      </main>
    );
  }
  if (!s) redirect("/login");
  if (!s.autorizado) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <Result status="403" title="Sin acceso" subTitle="Esta cuenta no tiene permiso para consultar el seguimiento de contratación." />
      </main>
    );
  }
  return <Shell nombre={s.usuario.nombre}>{children}</Shell>;
}
