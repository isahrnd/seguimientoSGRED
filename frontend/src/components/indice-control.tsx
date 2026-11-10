"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Popover, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useActualizarIndice, useFuentes, useSincronizacion } from "@/hooks/queries";
import { fechaCorta, resumenFuente } from "@/lib/format";
import type { FuenteEstado, ResumenFuenteIndice } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";

const NOMBRE = { LOCAL: "Carpeta local", DRIVE: "Google Drive" } as const;

function FilaFuente({ tipo, r }: { tipo: "LOCAL" | "DRIVE"; r: ResumenFuenteIndice }) {
  const s = resumenFuente(tipo, r.estado);
  const Icono = s.tono === "error" ? CloseCircleOutlined : s.tono === "ok" ? CheckCircleOutlined : WarningOutlined;
  const color = s.tono === "error" ? PALETA.rojo : s.tono === "ok" ? PALETA.petroleo : PALETA.ambar;
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
      <Icono style={{ color, marginTop: 4 }} aria-hidden />
      <span>
        <strong>{NOMBRE[tipo]}:</strong> {s.texto}
        {r.estado === "CORRECTA" && (
          <span className="texto-secundario"> {r.total} documentos · {r.nuevos} nuevos · {r.modificados ?? 0} modificados · {r.retirados} retirados</span>
        )}
      </span>
    </li>
  );
}

/** Estado de las fuentes (secundario) y botón «Actualizar índice» con progreso y resultado por fuente. */
export function IndiceControl() {
  const act = useActualizarIndice();
  const fuentes = useFuentes();
  const sinc = useSincronizacion();
  const [abierto, setAbierto] = useState(false);
  const t = act.trabajo;

  useEffect(() => {
    if (act.enCurso) setAbierto(true);
  }, [act.enCurso]);

  const drive = fuentes.data?.find((f: FuenteEstado) => f.tipo === "DRIVE");
  const resumenDrive = !drive
    ? "Drive: …"
    : drive.estado === "ERROR"
      ? "Drive sin conexión"
      : drive.estado === "SIN_CONFIGURAR"
        ? "Drive sin configurar"
        : "Drive conectado";
  const ultima = sinc.data?.ultima_correcta ?? drive?.ultima_correcta ?? null;

  const panel = (
    <div style={{ width: 360, maxWidth: "80vw" }} aria-live="polite">
      {act.enCurso && (
        <p style={{ margin: 0 }}><LoadingOutlined /> Actualizando el índice de documentos…</p>
      )}
      {act.aviso && <Alert type="info" showIcon message={act.aviso} style={{ marginBottom: 8 }} />}
      {act.errorConsulta && <Alert type="error" showIcon message="No se pudo consultar el avance." style={{ marginBottom: 8 }} />}
      {t && t.estado === "FINALIZADA" && t.resultado && (
        <>
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Actualización finalizada {t.finalizado_en ? `· ${fechaCorta(t.finalizado_en)}` : ""}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <FilaFuente tipo="LOCAL" r={t.resultado.local} />
            <FilaFuente tipo="DRIVE" r={t.resultado.drive} />
          </ul>
          {t.cambios.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {t.cambios.slice(0, 6).map((c, i) => <li key={i} className="largo">{c.tipo === "NUEVO" ? "Nuevo" : c.tipo === "MODIFICADO" ? "Modificado" : "Retirado"}: {c.nombre}</li>)}
              {t.cambios.length > 6 && <li>y {t.cambios.length - 6} más</li>}
            </ul>
          )}
        </>
      )}
      {t && t.estado === "ERROR" && <Alert type="error" showIcon message="La actualización terminó con error" description={t.error ?? undefined} />}
      {!t && !act.enCurso && !act.aviso && (
        <>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(fuentes.data ?? []).map((f) => (
              <li key={f.tipo} style={{ marginBottom: 6 }}>
                <strong>{NOMBRE[f.tipo]}:</strong> {resumenFuente(f.tipo, f.estado).texto}
                <div className="texto-secundario" style={{ fontSize: 13 }}>Última lectura correcta: {fechaCorta(f.ultima_correcta)}</div>
              </li>
            ))}
          </ul>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {sinc.data?.automatica ? `Se actualiza sola cada ${sinc.data.intervalo_minutos} minutos.` : "La actualización automática está desactivada."}
          </Typography.Text>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="texto-secundario" style={{ fontSize: 13, textAlign: "right", lineHeight: 1.3 }}>
        {resumenDrive}
        <br />
        <span>Actualizado: {fechaCorta(ultima)}</span>
      </span>
      <Popover content={panel} open={abierto} onOpenChange={setAbierto} trigger="click" placement="bottomRight" title="Fuentes de documentos">
        <Button icon={act.enCurso ? <LoadingOutlined /> : <ReloadOutlined />} onClick={() => { setAbierto(true); if (!act.enCurso) act.iniciar(); }} aria-label="Actualizar índice">
          {act.enCurso ? "Actualizando…" : "Actualizar índice"}
        </Button>
      </Popover>
    </div>
  );
}
