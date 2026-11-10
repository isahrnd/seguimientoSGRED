"use client";
import Link from "next/link";
import { FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { Tag, Typography } from "antd";
import { etiquetaCelda, urlHoja } from "@/lib/format";
import type { SoporteRef } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";

export function urlVisor(versionId: number, pagina?: number | null) {
  return `/documentos/visor/${versionId}${pagina ? `?pagina=${pagina}` : ""}`;
}

/** Lleva de una cifra al documento y a la página (PDF) o a la hoja y celda (Excel) que la sustentan, indicando la versión. */
export function SoporteLink({ soporte, corto }: { soporte: SoporteRef | null | undefined; corto?: boolean }) {
  if (!soporte) return <Typography.Text type="secondary" style={{ fontSize: 13 }}>Pendiente de soporte</Typography.Text>;
  const celda = etiquetaCelda(soporte.hoja, soporte.celda);
  const href = celda ? urlHoja(soporte.version_id, soporte.hoja, soporte.celda) : urlVisor(soporte.version_id, soporte.pagina);
  const Icono = celda ? FileExcelOutlined : FilePdfOutlined;
  const texto = celda ?? (soporte.pagina ? `Pág. ${soporte.pagina}` : "Abrir soporte");
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <Link href={href} title={soporte.documento ?? undefined} style={{ color: PALETA.tinta, fontWeight: 600, fontSize: 13.5, display: "inline-flex", gap: 5, alignItems: "center" }}>
        <Icono aria-hidden /> {texto}
      </Link>
      {!corto && <span className="texto-secundario" style={{ fontSize: 12.5 }}>{soporte.documento ? `${soporte.documento} · ` : ""}v{soporte.numero_version}</span>}
      {!soporte.es_vigente && (
        <Tag color="warning" style={{ marginInlineEnd: 0 }}>
          versión anterior
          {soporte.version_vigente_id && (
            <>
              {" · "}
              <Link href={celda ? urlHoja(soporte.version_vigente_id, soporte.hoja, soporte.celda) : urlVisor(soporte.version_vigente_id)}>ver vigente</Link>
            </>
          )}
        </Tag>
      )}
    </span>
  );
}
