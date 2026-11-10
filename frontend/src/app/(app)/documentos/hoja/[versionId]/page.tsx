"use client";
import { Suspense, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Skeleton, Tabs } from "antd";
import { ArrowLeftOutlined, FileExcelOutlined } from "@ant-design/icons";
import { useHoja } from "@/hooks/queries";
import { useUrlState } from "@/hooks/use-url-state";
import { ApiError, esErrorDeAcceso } from "@/lib/api";
import { parsearCelda } from "@/lib/format";
import { SinAcceso } from "@/components/estados";
import { PALETA } from "@/theme/theme";

const CLAVES = ["indice", "hoja", "celda"] as const;

function columna(n: number): string {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function Contenido({ versionId }: { versionId: number }) {
  const router = useRouter();
  const { valores, cambiar } = useUrlState(CLAVES);
  const indice = Number(valores.indice) || 0;
  const q = useHoja(versionId, indice);
  const d = q.data;
  const objetivo = parsearCelda(valores.celda);

  // Si se indicó la hoja por nombre, se selecciona su índice; luego se desplaza a la celda resaltada.
  useEffect(() => {
    if (!d || !valores.hoja || valores.indice) return;
    const h = d.hojas.find((x) => x.nombre === valores.hoja);
    if (h && h.indice !== d.hoja.indice) cambiar({ indice: String(h.indice) });
  }, [d, valores.hoja, valores.indice, cambiar]);
  const hojaCorrecta = !valores.hoja || d?.hoja.nombre === valores.hoja;
  useEffect(() => {
    if (d && objetivo && hojaCorrecta) document.getElementById("celda-objetivo")?.scrollIntoView({ block: "center", inline: "center" });
  }, [d, objetivo, hojaCorrecta]);

  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  const status = q.error instanceof ApiError ? q.error.status : 0;

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginLeft: -12 }}>Volver</Button>
        <span className="largo texto-secundario"><FileExcelOutlined style={{ color: PALETA.petroleo }} /> {d ? `${d.documento} · v${d.numero_version}` : "Vista previa de hoja de cálculo"}</span>
      </div>

      {q.isLoading && <Skeleton active paragraph={{ rows: 8 }} />}
      {q.isError && !esErrorDeAcceso(q.error) && (
        <Alert type="warning" showIcon message={status === 410 || status === 404 ? "El archivo ya no está disponible en una fuente autorizada o cambió. Actualice el índice." : status === 413 ? "El archivo es demasiado grande para la vista previa." : "No fue posible mostrar este archivo."} />
      )}

      {d && (
        <>
          <Tabs activeKey={String(d.hoja.indice)} onChange={(k) => cambiar({ indice: Number(k) ? k : "", hoja: "", celda: "" })} items={d.hojas.map((h) => ({ key: String(h.indice), label: h.nombre }))} />
          <div role="region" aria-label={`Contenido de la hoja ${d.hoja.nombre}`} tabIndex={0} style={{ maxHeight: "68vh", overflow: "auto", border: `1px solid ${PALETA.borde}`, borderRadius: 8, background: "#fff" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 14, minWidth: "100%", width: "max-content" }}>
              <thead style={{ position: "sticky", top: 0, background: PALETA.fondo, zIndex: 1 }}>
                <tr>
                  <th scope="col" style={{ borderBottom: `1px solid ${PALETA.borde}`, borderRight: `1px solid ${PALETA.borde}`, padding: "4px 8px" }}><span style={{ position: "absolute", left: -9999 }}>Fila</span></th>
                  {Array.from({ length: d.hoja.filas[0]?.length ?? 0 }).map((_, c) => <th key={c} scope="col" style={{ borderBottom: `1px solid ${PALETA.borde}`, borderRight: `1px solid ${PALETA.borde}`, padding: "4px 8px", color: PALETA.textoSecundario, fontWeight: 600 }}>{columna(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.hoja.filas.map((fila, r) => (
                  <tr key={r} style={{ background: r % 2 ? "#F8FAFC" : "#fff" }}>
                    <th scope="row" style={{ borderRight: `1px solid ${PALETA.borde}`, padding: "4px 8px", textAlign: "right", color: PALETA.textoSecundario, fontWeight: 400 }}>{r + 1}</th>
                    {fila.map((v, c) => {
                      const esObjetivo = hojaCorrecta && objetivo?.fila === r + 1 && objetivo.columna === c + 1;
                      return (
                        <td key={c} id={esObjetivo ? "celda-objetivo" : undefined} aria-label={esObjetivo ? "Celda que sustenta la cifra" : undefined}
                          style={{ maxWidth: 320, borderRight: "1px solid #E6EAF0", padding: "4px 8px", verticalAlign: "top", textAlign: typeof v === "number" ? "right" : "left", fontVariantNumeric: "tabular-nums", whiteSpace: typeof v === "number" ? "nowrap" : "pre-wrap", overflowWrap: "anywhere", background: esObjetivo ? "#FFE58F" : undefined, fontWeight: esObjetivo ? 700 : undefined, outline: esObjetivo ? `2px solid ${PALETA.ambar}` : undefined }}>
                          {v === null ? "" : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {objetivo && valores.celda && (
            <p style={{ margin: 0 }}>{hojaCorrecta ? <>Celda resaltada: <strong>{valores.celda.toUpperCase()}</strong> de la hoja {d.hoja.nombre}.</> : <>La hoja “{valores.hoja}” no existe en esta versión del archivo.</>}</p>
          )}
          <p className="texto-secundario" style={{ fontSize: 13.5, margin: 0 }}>
            Las celdas se muestran como datos: resultado almacenado de las fórmulas, sin macros ni enlaces.
            {d.hoja.truncado && <strong style={{ color: PALETA.ambar }}> Hoja recortada: se muestran {d.hoja.filas.length} filas y {d.hoja.filas[0]?.length ?? 0} columnas de {d.hoja.total_filas} × {d.hoja.total_columnas}; consulte el archivo original para ver el resto.</strong>}
          </p>
        </>
      )}
    </div>
  );
}

export default function HojaPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const id = Number(versionId);
  if (!Number.isInteger(id) || id < 1) return <p>Documento no válido.</p>;
  return <Suspense fallback={<Skeleton active />}><Contenido versionId={id} /></Suspense>;
}
