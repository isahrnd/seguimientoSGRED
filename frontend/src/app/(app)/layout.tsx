import { redirect } from "next/navigation";
import { Result } from "antd";
import { Shell } from "@/components/shell";
import { sesionServidor } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await sesionServidor();
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
