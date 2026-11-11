"use client";
import type { LecturaAsistida as Lectura } from "@/types/contratacion";
import { cop } from "@/lib/format";

const ETQ: Record<string, string> = {
  proceso: "Proceso", contrato: "Contrato", contratista: "Contratista", importe: "Importe", edificio: "Edificio", intervencion: "Intervención", etapa: "Etapa",
  proveedor: "Proveedor", nit_proveedor: "NIT del proveedor", numero_cotizacion: "N.º de cotización", fecha_cotizacion: "Fecha de la cotización", forma_pago: "Forma de pago",
  resolucion_numero: "N.º de resolución", direccion: "Dirección", codigo_atc: "Código ATC-20", matricula_inmobiliaria: "Matrícula inmobiliaria del predio",
};
const ORIGEN: Record<string, string> = { ASISTIDA: "Lectura asistida del PDF", NATIVA: "Lectura nativa del PDF", HOJA_DE_CALCULO: "Lectura directa de la hoja de cálculo" };
const NIVEL: Record<string, string> = { PARTIDA: "Partida", SUBTOTAL: "Subtotal", TOTAL: "Total", IMPUESTO_O_AIU: "AIU / impuesto", COMPONENTE_SIN_VALOR: "Componente sin valor" };
const fuente = (p: { fuente?: string | null; pagina?: number | null }) => p.fuente ?? (p.pagina ? `p. ${p.pagina}` : "—");

/** Contenido adicional (otra hoja del archivo, relación sin confirmar): plegado por defecto pero consultable. */
function Envoltura({ adicional, documento, children }: { adicional: boolean; documento: string; children: React.ReactNode }) {
  return adicional
    ? <details style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #E6EAF0" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>Contenido adicional pendiente de revisión — {documento}</summary>{children}</details>
    : <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #E6EAF0" }}><div style={{ fontWeight: 600 }}>{documento}</div>{children}</div>;
}

/**
 * Datos extraídos de los documentos, cada uno con su fuente (página o celda). Son pendientes de verificación y no entran en los totales.
 * Se distingue «dato no encontrado por el extractor» de «soporte no disponible»; una oferta nunca se presenta como valor contratado.
 */
export function LecturaAsistida({ lectura }: { lectura: Lectura[] | undefined }) {
  const l = lectura ?? [];
  if (l.length === 0) return null;
  return (
    <section aria-label="Datos extraídos pendientes de verificación" style={{ marginTop: 16, background: "#fff", border: "1px solid #D5DBE5", borderRadius: 8, padding: "16px 18px" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Datos extraídos pendientes de verificación</h2>
      <p className="texto-secundario" style={{ margin: "4px 0 0", fontSize: 13.5 }}>Fuente: lectura de los documentos. No entran en los totales hasta que se verifiquen y una oferta no es un valor contratado.</p>
      {l.map((x, idx) => {
        const adicional = !!x.excluida_de_indicadores;
        return (
        <Envoltura key={`${x.version_id}-${idx}`} adicional={adicional} documento={x.documento}>
          <div className="texto-secundario" style={{ fontSize: 12.5 }}>
            {ORIGEN[x.origen ?? "ASISTIDA"]}
            {x.trazabilidad?.reutilizado_de ? ` · resultado de ${x.trazabilidad.reutilizado_de}, reutilizado bajo ${x.trazabilidad.extractor_vigente}` : x.trazabilidad?.extractor ? ` · ${x.trazabilidad.extractor}` : ""}
          </div>
          {x.correspondencia_pendiente && (
            <p className="texto-secundario" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Excluido de los indicadores del edificio mientras no se confirme su relación. Hoja adicional del mismo archivo: su correspondencia con el edificio está pendiente de confirmar{x.correspondencia_pendiente.proyecto ? ` (proyecto citado: «${x.correspondencia_pendiente.proyecto.nombre}», celda ${x.correspondencia_pendiente.proyecto.celda})` : ""}. Señales para revisión: {x.correspondencia_pendiente.senales.join("; ")}. Sus datos se muestran aparte y no se mezclan con los de la hoja principal.
            </p>
          )}
          {x.campos.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {x.campos.map((c) => (
                <li key={c.campo}>
                  <strong>{ETQ[c.campo] ?? c.campo}:</strong> {c.campo === "importe" && typeof c.valor === "number" ? cop(c.valor) : String(c.valor)}{" "}
                  <span className="texto-secundario">({fuente(c)}{c.cita ? `: «${c.cita}»` : ""})</span>
                </li>
              ))}
            </ul>
          )}
          {x.coincidencia_edificio && x.coincidencia_edificio.estado !== "SIN_COINCIDENCIA" && (
            <p className="texto-secundario" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Edificio del documento: {x.coincidencia_edificio.estado === "COINCIDE" ? "igual a" : "parecido a"} {x.coincidencia_edificio.edificio}
              {x.coincidencia_edificio.vinculado_al_documento ? " (vinculado al documento)" : " (no vinculado al documento; sin confirmar)"}.
            </p>
          )}
          {(x.partidas ?? []).length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ marginTop: 8, borderCollapse: "collapse", fontSize: 13.5, width: "100%", minWidth: 640 }}>
                <caption style={{ textAlign: "left", fontWeight: 600 }}>Importes por edificio o alcance (por verificar)</caption>
                <thead><tr><th style={{ textAlign: "left" }}>Edificio</th><th style={{ textAlign: "left" }}>Alcance</th><th style={{ textAlign: "left" }}>Nivel</th><th style={{ textAlign: "right" }}>Importe</th><th style={{ textAlign: "left" }}>Fuente</th><th style={{ textAlign: "left" }}>Edificio registrado</th><th style={{ textAlign: "left" }}>Relación</th></tr></thead>
                <tbody>
                  {x.partidas!.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #E6EAF0", color: p.nivel && p.nivel !== "PARTIDA" ? "#5B6577" : undefined }}>
                      <td>{p.edificio ?? "—"}</td><td>{p.alcance}</td><td>{NIVEL[p.nivel ?? "PARTIDA"]}</td>
                      <td style={{ textAlign: "right" }} className="cifra">{p.importe === null ? "—" : cop(p.importe)}{p.unidad && p.unidad !== "GLOBAL" && p.unidad !== "GL" ? ` / ${p.unidad}` : ""}{p.importe_en_el_texto !== undefined && <div className="texto-secundario" style={{ fontSize: 12 }}>El texto lo expresa sin centavos ({cop(p.importe_en_el_texto)}); con centavos según OCR local de la página.</div>}</td>
                      <td>{fuente(p)}</td>
                      <td>{!p.coincidencia ? "—" : p.coincidencia.estado === "SIN_COINCIDENCIA" ? "Sin edificio registrado con ese nombre" : `${p.coincidencia.estado === "COINCIDE" ? "Igual a" : "Parecido a"} ${p.coincidencia.edificio}${p.coincidencia.vinculado_al_documento ? " (vinculado)" : " (no vinculado)"}`}</td>
                      <td>{p.relacion ? (p.relacion === "EXPLICITA" ? "Explícita en la cita" : "Pendiente de revisión") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!adicional && (
                <p className="texto-secundario" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {(x.suma_solo_partidas ?? 0) > 0
                    ? <>Suma solo de partidas: <span className="cifra">{cop(x.suma_solo_partidas ?? 0)}</span>. </>
                    : x.partidas!.some((p) => p.nivel === "TOTAL" || p.nivel === "SUBTOTAL")
                      ? <>Se identificaron totales; desglose pendiente de verificación. </>
                      : <>Contenido adicional pendiente de revisión. </>}
                  Los subtotales, totales e impuestos resumen a las partidas y no se suman a ellas.
                </p>
              )}
              {[...(x.controles_de_suma ?? []).filter((c) => c.estado !== "SIN_TOTAL_DECLARADO"), ...((x.controles_aritmeticos ?? []).map((c) => ({ grupo: c.control, suma_partidas: c.calculado, total_declarado: c.declarado, estado: c.estado, diferencia: c.diferencia })))].map((c, i) => (
                <p key={i} className="texto-secundario" style={{ margin: "2px 0 0", fontSize: 13 }}>
                  {c.grupo}: calculado {cop(c.suma_partidas)} · declarado {cop(c.total_declarado as number)} — {c.estado === "CUADRA" ? "cuadra" : `no cuadra (diferencia ${cop(c.diferencia as number)})`}
                </p>
              ))}
            </div>
          )}
          {!adicional && (x.edificios_sin_vinculo ?? []).length > 0 && (
            <p className="texto-secundario" style={{ margin: "6px 0 0", fontSize: 13 }}>
              La tabla cita {x.edificios_en_tabla} edificios y el documento tiene {x.edificios_vinculados_al_documento} vinculados. Sin vínculo confirmado: {x.edificios_sin_vinculo!.join("; ")}. Las relaciones siguen pendientes de revisión.
            </p>
          )}
          {(x.no_encontrados ?? []).length > 0 && (
            <p className="texto-secundario" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Dato no encontrado por el extractor: {x.no_encontrados!.map((n) => `${ETQ[n.campo] ?? n.campo} (${n.motivo})`).join("; ")}. Esto no implica que el soporte no exista.
            </p>
          )}
        </Envoltura>
        );
      })}
    </section>
  );
}
