"use client";
import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Form, Input, Typography } from "antd";
import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { api, ApiError } from "@/lib/api";

function Formulario() {
  const volver = useSearchParams().get("volver");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(v: { correo: string; password: string }) {
    setCargando(true);
    setError(null);
    try {
      await api.login(v.correo, v.password);
      // Navegación completa: el servidor revalida la sesión antes de entregar cualquier pantalla.
      location.assign(volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? e.message : "No fue posible iniciar sesión. Intente de nuevo.");
      setCargando(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: 32 }}>
        <Image src="/images/logo-infogred.png" alt="INFOGRED" width={168} height={43} priority style={{ height: "auto" }} />
        <Typography.Title level={2} style={{ margin: "24px 0 4px" }}>Seguimiento SGRED</Typography.Title>
        <Typography.Paragraph className="texto-secundario" style={{ marginBottom: 20 }}>Contratación de demoliciones. Acceso restringido.</Typography.Paragraph>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} role="alert" />}
        <Form layout="vertical" onFinish={entrar} requiredMark={false} autoComplete="on">
          <Form.Item name="correo" label="Correo" rules={[{ required: true, message: "Escriba su correo" }]}>
            <Input size="large" prefix={<MailOutlined />} autoComplete="username" autoFocus inputMode="email" />
          </Form.Item>
          <Form.Item name="password" label="Contraseña" rules={[{ required: true, message: "Escriba su contraseña" }]}>
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={cargando}>Iniciar sesión</Button>
        </Form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
