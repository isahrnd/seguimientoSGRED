"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "antd";
import { FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import { cop, urlHoja } from "@/lib/format";
import { urlVisor } from "@/components/soporte-link";
import type { FilaPrecios, FuenteDato, ProcedenciaValor } from "@/types/contratacion";

export const ETQ_PROCEDENCIA: Record<ProcedenciaValor, string> = { CONTRATO: "Contrato", CONSOLIDADO: "Consolidado", MATRIZ: "Matriz", PRESUPUESTO: "Presupuesto", COTIZACION: "Cotización" };
const COLORES: Record<ProcedenciaValor, { fondo: string; borde: string; texto: string }> = {
  CONTRATO: { fondo: "#E6F3F2", borde: "#B5DAD7", texto: "#0B534F" },
  CONSOLIDADO: { fondo: "#EEF3F9", borde: "#C9D8E8", texto: "#2A4A6B" },
  MATRIZ: { fondo: "#F3F5F9", borde: "#D5DBE5", texto: "#4A5568" },
  PRESUPUESTO: { fondo: "#F3F5F9", borde: "#D5DBE5", texto: "#4A5568" },
  COTIZACION: { fondo: "#F3F5F9", borde: "#D5DBE5", texto: "#4A5568" },
};

/** Procedencia del valor: etiqueta breve y suave (no es una advertencia). */
export function Procedencia({ p, titulo }: { p: ProcedenciaValor; titulo?: string }) {
  const c = COLORES[p];
  return <span title={titulo} style={{ display: "inline-block", background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto, borderRadius: 5, padding: "0 7px", fontSize: 12, lineHeight: "20px" }}>{ETQ_PROCEDENCIA[p]}</span>;
}

export const m2 = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} m²`;

/** Enlace a la página (PDF) o a la hoja y celda (Excel) que respalda un dato. */
export function VerFuente({ fuente, texto = "Ver fuente" }: { fuente: FuenteDato | null | undefined; texto?: string }) {
  if (!fuente || !fuente.version_id) return null;
  const hoja = !!fuente.hoja && !!fuente.celda;
  const href = hoja ? urlHoja(fuente.version_id, fuente.hoja, fuente.celda) : urlVisor(fuente.version_id, fuente.pagina);
  const Icono = hoja ? FileExcelOutlined : FilePdfOutlined;
  const donde = hoja ? `hoja ${fuente.hoja}, celda ${fuente.celda}` : fuente.pagina ? `pág. ${fuente.pagina}` : "";
  return (
    <Link href={href} style={{ fontSize: 12.5, whiteSpace: "nowrap" }} aria-label={`${texto}: ${fuente.documento ?? "documento"} ${donde}`} title={[fuente.documento, donde].filter(Boolean).join(" · ")}>
      <Icono aria-hidden /> {texto}{donde ? ` (${hoja ? fuente.celda : "p. " + fuente.pagina})` : ""}
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

/** Valor de una fila: valor con su procedencia, o contrato conjunto sin asignar su importe al edificio. */
export function ValorFila({ f, compacto }: { f: FilaPrecios; compacto?: boolean }): ReactNode {
  if (f.valor) {
    return (
      <div>
        <div className="cifra" style={{ fontWeight: 700, fontSize: compacto ? 15 : 16 }}>{cop(f.valor.valor)}</div>
        <div style={{ marginTop: 2 }}><Procedencia p={f.valor.procedencia} titulo={f.valor.etiqueta} /></div>
      </div>
    );
  }
  if (f.contrato_conjunto) {
    return (
      <div>
        <div style={{ fontWeight: 600 }}>Contrato conjunto</div>
        <div className="texto-secundario" style={{ fontSize: 12.5 }}>{cop(f.contrato_conjunto.valor)} · {f.contrato_conjunto.edificios} edificaciones</div>
      </div>
    );
  }
  return <span className="texto-secundario">—</span>;
}
