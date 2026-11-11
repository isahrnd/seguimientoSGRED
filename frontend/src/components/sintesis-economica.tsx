"use client";
import { EtiquetaInformativa } from "@/components/estado-informativo";
import { Tag } from "antd";
import { cop, ESTADO_VALOR_ETQ, PENDIENTE } from "@/lib/format";
import type { DetalleExpediente, ImporteSignificado, ValorSignificado } from "@/types/contratacion";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "./soporte-link";
import { ofertasSinTotal } from "@/lib/oferta";
import { FirmaContrato } from "./firma-contrato";

const QUE_ES: Record<ValorSignificado["tipo"], string> = {
  PRESUPUESTO_OFICIAL: "Presupuesto oficial",
  COTIZACION: "Cotización",
  OFERTA_SELECCIONADA: "Oferta seleccionada",
  VALOR_CONTRATADO: "Contratado",
  VALOR_EJECUTADO: "Ejecutado",
};

const FALTA: Record<ValorSignificado["tipo"], string> = {
  PRESUPUESTO_OFICIAL: "Falta el documento que fija el presupuesto.",
  COTIZACION: "No hay cotización registrada.",
  OFERTA_SELECCIONADA: "Falta el soporte de la selección.",
  VALOR_CONTRATADO: "Contrato o acto de adjudicación por incorporar.",
  VALOR_EJECUTADO: "Faltan actas de ejecución.",
};

function Importe({ i, grande }: { i: ImporteSignificado; grande: boolean }) {
  return (
    <div style={{ marginTop: grande ? 0 : 10 }}>
      <div className={grande ? "importe cifra" : "cifra"} style={{ fontSize: grande ? undefined : 17, fontWeight: grande ? undefined : 650, color: i.estado_soporte === "CITADO_SIN_ACTA" ? PALETA.ambar : PALETA.texto }}>
        {cop(i.importe)}
      </div>
      {(i.proveedor || i.concepto) && <div className="texto-secundario largo" style={{ fontSize: 13.5 }}>{[i.proveedor, i.concepto].filter(Boolean).join(" · ")}</div>}
      {i.estado_soporte === "CITADO_SIN_ACTA" && <div style={{ fontSize: 13, color: PALETA.ambar, fontWeight: 600 }}>Citado en el análisis; acta pendiente</div>}
      <div style={{ marginTop: 2 }}><SoporteLink soporte={i.soporte} /></div>
    </div>
  );
}

/** Los cinco valores económicos, cada uno con lo que representa y su fuente. El pago se muestra solo si existe soporte. */
export function SintesisEconomica({ d }: { d: DetalleExpediente }) {
  const valores = d.comparacion.valores;
  const sinTotal = ofertasSinTotal(d);
  const pagos = d.ejecucion.valores.filter((v) => /pago|desembolso|cuenta de cobro/i.test(v.concepto));
  return (
    <section aria-label="Síntesis económica">
      <div className="grupo-valores">
        {valores.map((v) => (
          <div key={v.tipo}>
            <div className="etq-valor">{QUE_ES[v.tipo]}</div>
            {v.importes.length === 0 && v.tipo === "COTIZACION" && sinTotal.length > 0 ? (
              <>
                {sinTotal.map((o) => (
                  <div key={o.proveedor} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 650 }}>Oferta de {o.proveedor.replace(/ (S.A.S?.?|S.A.)$/, "")} · {o.partidas} partidas</div>
                    <div style={{ color: PALETA.ambar, fontWeight: 650 }}>Total de la oferta pendiente de soporte</div>
                    {o.sumaCostoDirecto !== null && (
                      <div style={{ marginTop: 6 }}>
                        <div className="texto-secundario" style={{ fontSize: 13 }}>Suma de costos directos de las partidas</div>
                        <div className="cifra" style={{ fontSize: 18, fontWeight: 700 }}>{cop(o.sumaCostoDirecto)}</div>
                        {o.partidasOtraBase > 0 && <div className="texto-secundario" style={{ fontSize: 12.5 }}>{o.partidasOtraBase} partidas con otra base no incluidas</div>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{o.soportes.map((x, k) => <SoporteLink key={k} soporte={x} corto />)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : v.importes.length === 0 ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 650, color: PALETA.ambar }}>{PENDIENTE}</div>
                <div className="texto-secundario" style={{ fontSize: 13.5, marginTop: 4 }}>{FALTA[v.tipo]}</div>
              </>
            ) : (
              <>
                {v.importes.slice(0, 3).map((i, k) => <Importe key={k} i={i} grande={k === 0} />)}
                {v.tipo === "VALOR_CONTRATADO" && d.contratacion.contratos.slice(0, 3).map((c) => <FirmaContrato key={c.id} c={c} detalle={false} />)}
                {v.importes.length > 3 && <div className="texto-secundario" style={{ fontSize: 13, marginTop: 8 }}>y {v.importes.length - 3} más en el detalle</div>}
                {v.tipo === "VALOR_EJECUTADO" && new Set(v.importes.map((i) => i.importe)).size > 1 && <div style={{ fontSize: 13, color: PALETA.ambar, fontWeight: 600, marginTop: 8 }}>Importes distintos, sin conciliar: no se suman</div>}
                {v.estado !== "SOPORTADO" && <div style={{ marginTop: 8 }}><EtiquetaInformativa>{ESTADO_VALOR_ETQ[v.estado]}</EtiquetaInformativa></div>}
              </>
            )}
          </div>
        ))}
      </div>
      {pagos.length > 0 && (
        <div style={{ marginTop: 12, padding: "12px 16px", background: PALETA.petroleoFondo, borderRadius: 8 }}>
          <strong>Pagos con soporte: </strong>
          {pagos.map((p) => (
            <span key={p.id} style={{ marginRight: 16 }} className="cifra">{cop(p.importe)} <SoporteLink soporte={p.soporte} corto /></span>
          ))}
        </div>
      )}
    </section>
  );
}
