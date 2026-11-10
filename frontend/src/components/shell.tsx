"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Dropdown, Grid, Layout } from "antd";
import { FileSearchOutlined, FolderOpenOutlined, HomeOutlined, LogoutOutlined, ApartmentOutlined, LineChartOutlined, UserOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IndiceControl } from "./indice-control";

const ITEMS = [
  { key: "/", href: "/", label: "Inicio", icon: <HomeOutlined /> },
  { key: "/expedientes", href: "/expedientes", label: "Expedientes", icon: <FolderOpenOutlined /> },
  { key: "/edificaciones", href: "/edificaciones", label: "Edificaciones", icon: <ApartmentOutlined /> },
  { key: "/analisis-precios", href: "/analisis-precios", label: "Análisis de precios", icon: <LineChartOutlined /> },
  { key: "/documentos", href: "/documentos", label: "Documentos", icon: <FileSearchOutlined /> },
];

export function Shell({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const pantallas = Grid.useBreakpoint();
  const compacto = !pantallas.lg;
  const amplio = !!pantallas.xl;
  const activo = ITEMS.filter((i) => i.key !== "/" && path.startsWith(i.key)).map((i) => i.key)[0] ?? (path === "/" ? "/" : "");

  async function salir() {
    try { await api.logout(); } finally {
      qc.clear();
      // Reemplaza la entrada del historial: «Atrás» no regresa a una pantalla privada.
      router.replace("/login");
      location.replace("/login");
    }
  }

  return (
    <Layout style={{ minHeight: "100dvh", background: "transparent" }}>
      <a href="#contenido" className="saltar">Saltar al contenido</a>
      <Layout.Header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 24, borderBottom: "1px solid #D5DBE5", height: "auto", minHeight: 64, flexWrap: compacto ? "wrap" : "nowrap", padding: compacto ? "8px 14px" : "0 32px" }}>
        <Link href="/" aria-label="Seguimiento SGRED, inicio" style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <Image src="/images/logo-infogred.png" alt="INFOGRED" width={110} height={28} priority style={{ height: "auto" }} />
          <span style={{ fontWeight: 650, fontSize: 16, color: "#1A2433", borderLeft: "1px solid #D5DBE5", paddingLeft: 12 }}>Seguimiento SGRED</span>
        </Link>
        <nav aria-label="Secciones" style={{ flex: 1, minWidth: 0, display: 'flex', gap: compacto ? 4 : 8, order: compacto ? 3 : 0, width: compacto ? '100%' : undefined, overflowX: 'auto' }}>
          {ITEMS.map((i) => {
            const sel = i.key === activo;
            return (
              <Link key={i.key} href={i.href} aria-current={sel ? 'page' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: compacto ? '8px 10px' : '0 12px', height: compacto ? 40 : 64, whiteSpace: 'nowrap', fontWeight: sel ? 650 : 500, color: sel ? '#1B3A6B' : '#4A5568', borderBottom: sel ? '3px solid #1B3A6B' : '3px solid transparent' }}>
                {amplio && i.icon}{i.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginLeft: compacto ? "auto" : 0, display: "flex", alignItems: "center", gap: 14 }}>
                    <Dropdown menu={{ items: [{ key: "salir", icon: <LogoutOutlined />, label: "Cerrar sesión", onClick: salir }] }} trigger={["click"]}>
            <Button icon={<UserOutlined />} aria-label={`Cuenta de ${nombre}`}>{compacto ? "" : nombre}</Button>
          </Dropdown>
        </div>
      </Layout.Header>
      <Layout.Content id="contenido" className="contenedor">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><IndiceControl /></div>
        {children}
      </Layout.Content>
    </Layout>
  );
}
