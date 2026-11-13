"use client";
import Link from "next/link";
import { Button } from "antd";
import { FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import { urlHoja } from "@/lib/format";
import { urlVisor } from "@/components/soporte-link";
import type { FuenteDato } from "@/types/contratacion";

export const m2 = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m²`;

/** Enlace de fuente de un clic: abre el documento en la página (PDF) o la hoja y celda (Excel) que respalda el dato, sin desplegar nombres ni ubicaciones. */
export function FuenteLink({ fuente, texto = "Fuente" }: { fuente: FuenteDato | null | undefined; texto?: string }) {
  if (!fuente || !fuente.version_id) return null;
  const hoja = !!fuente.hoja && !!fuente.celda;
  const href = hoja ? urlHoja(fuente.version_id, fuente.hoja, fuente.celda) : urlVisor(fuente.version_id, fuente.pagina);
  const Icono = hoja ? FileExcelOutlined : FilePdfOutlined;
  const donde = hoja ? `hoja ${fuente.hoja}, celda ${fuente.celda}` : fuente.pagina ? `pág. ${fuente.pagina}` : "";
  return (
    <Link href={href} style={{ fontSize: 14.5, whiteSpace: "nowrap", fontWeight: 600 }} aria-label={`${texto}: ${fuente.documento ?? "documento"} ${donde}`} title={[fuente.documento, donde].filter(Boolean).join(" · ")}>
      <Icono aria-hidden /> {texto}
    </Link>
  );
}

/** Botón «Exportar PDF» (descarga autenticada con la cookie de la sesión). */
export function BotonPdf({ href, texto = "Exportar PDF" }: { href: string; texto?: string }) {
  return <Button type="primary" size="large" icon={<FilePdfOutlined aria-hidden />} href={href} download style={{ fontWeight: 600 }}>{texto}</Button>;
}

/** Botón secundario «Exportar Excel» (mismos datos que la pantalla y el PDF). */
export function BotonExcel({ href, texto = "Exportar Excel" }: { href: string; texto?: string }) {
  return <Button size="large" icon={<FileExcelOutlined aria-hidden />} href={href} download>{texto}</Button>;
}
