"use client";
import { use } from "react";
import Link from "next/link";
import { Alert, Skeleton, Tag } from "antd";
import { useDetalleEdificio } from "@/hooks/queries";
import { PENDIENTE, cop } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { Volver } from "@/components/volver";
import { EstadoResolucion, ListaDocumentosEdificio } from "@/components/edificios-soportes";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "@/components/soporte-link";
import { discrepanciasDireccion } from "@/lib/direccion";

const Caja = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 18 }}>
    <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>{titulo}</h2>
    {children}
  </section>
);

export default function FichaEdificacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useDetalleEdificio(Number(id));
  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar la edificación." onReintentar={() => q.refetch()} />;
  const d = q.data;
  const discrepancias = discrepanciasDireccion(d.edificio.direccion, [...d.visitas_y_soportes_tecnicos, ...d.grupos.flatMap((g) => g.documentos)].map((x) => x.nombre));
  const resto = d.grupos.filter((g) => g.codigo !== "VISITA_SOPORTE_TECNICO");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <Volver alternativa="/edificaciones" texto="Volver" />
        <h1 className="largo" style={{ margin: "6px 0 0", fontSize: 30 }}>{d.edificio.nombre}</h1>
        {d.edificio.direccion && <p className="texto-secundario largo" style={{ margin: "4px 0 0" }}>{d.edificio.direccion}</p>}
      </div>

      {discrepancias.length > 0 && (
        <Alert type="warning" showIcon message="Discrepancia documental de dirección por aclarar"
          description={<>La dirección registrada es <strong>{d.edificio.direccion}</strong>, pero estos documentos mencionan otra: {discrepancias.join("; ")}. No se ha determinado cuál es la correcta.</>} />
      )}

      {d.sin_proceso_confirmado && (
        <Alert type="warning" showIcon message="Proceso contractual pendiente" description="Aún no se ha confirmado la relación de esta edificación con un contrato. Sus visitas y cotizaciones confirmadas se pueden consultar abajo." />
      )}

      <Caja titulo="Resolución de demolición"><EstadoResolucion r={d.resolucion} /></Caja>

      <Caja titulo="Procesos contractuales">
        {d.procesos.length === 0 ? <span className="texto-secundario">{PENDIENTE}</span> : (
          <div style={{ display: "grid", gap: 10 }}>
            {d.procesos.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid #E6EAF0", paddingBottom: 10 }}>
                <Link href={`/expedientes/${p.id}`} style={{ fontWeight: 600 }}>{p.proceso}</Link> <Tag>{p.estado_asociacion}</Tag>
                <div className="largo">{p.intervencion}</div>
                <div className="texto-secundario" style={{ fontSize: 13.5 }}>
                  Valor contratado del proceso: <span className="cifra">{p.valor_contratado !== null ? cop(p.valor_contratado) : PENDIENTE}</span>{p.nota_valor ? ` · ${p.nota_valor}` : ""}
                  {p.edificios_del_proceso > 1 && ` · cubre ${p.edificios_del_proceso} edificaciones con un único total`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Caja>

      {d.cotizaciones.length > 0 && (
        <Caja titulo="Cotizaciones de esta edificación">
          {Object.entries(d.cotizaciones.reduce<Record<string, typeof d.cotizaciones>>((a, c) => ((a[c.proveedor] ??= []).push(c), a), {})).map(([prov, cs]) => {
            const base = cs.find((c) => c.soporte.pagina !== null) ?? cs[0];
            return (
              <div key={prov}>
                <h3 className="largo" style={{ margin: "0 0 4px", fontSize: 17 }}>{prov}</h3>
                <div className="importe cifra">{cop(base.importe)}</div>
                <div className="largo" style={{ fontWeight: 600 }}>{base.concepto}</div>
                <div className="texto-secundario" style={{ fontSize: 13.5 }}>
                  {base.base === "COSTO_DIRECTO" ? "Costo directo de esta edificación, antes de administración, imprevistos, utilidad e IVA." : "Total según la fuente."}
                </div>
                {base.alcance_oferta && (
                  <p className="largo" style={{ margin: "8px 0 0" }}>
                    <strong>Es una oferta conjunta:</strong> {base.alcance_oferta}.
                    {base.total_oferta !== null && <> Total de la oferta: <span className="cifra">{cop(base.total_oferta)}</span>; este importe no es el total del edificio con AIU.</>}
                  </p>
                )}
                <p style={{ margin: "12px 0 4px", fontWeight: 600 }}>Dónde se comprueba</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {cs.map((c) => (
                    <li key={c.id} className="largo">
                      <SoporteLink soporte={c.soporte} />{" "}
                      <Tag color={c.verificacion === "VERIFICADO_EN_IMAGEN" ? "success" : c.verificacion === "COINCIDE_CON_PDF" ? "processing" : "warning"}>
                        {c.verificacion === "VERIFICADO_EN_IMAGEN" ? "Verificado en la imagen del PDF" : c.verificacion === "COINCIDE_CON_PDF" ? "Referencia del comparativo; coincide con el PDF" : "Pendiente de verificar"}
                      </Tag>
                      {c.nota && <div className="texto-secundario" style={{ fontSize: 13 }}>{c.nota}</div>}
                    </li>
                  ))}
                </ul>
                <Alert style={{ marginTop: 12 }} type="warning" showIcon message={base.proceso ? `Asociada al proceso ${base.proceso.proceso}` : "Sin proceso contractual verificado"}
                  description={base.proceso ? undefined : "La cotización está ligada solo a esta edificación. Se asociará a un expediente cuando exista un número de proceso verificable."} />
              </div>
            );
          })}
        </Caja>
      )}

      <Caja titulo="Visitas y soportes técnicos">
        {d.visitas_y_soportes_tecnicos.length === 0
          ? <span className="texto-secundario">{PENDIENTE}: no hay visitas ni soportes técnicos vinculados a esta edificación.</span>
          : <ListaDocumentosEdificio docs={d.visitas_y_soportes_tecnicos} ocultarProceso={d.sin_proceso_confirmado} />}
      </Caja>

      {resto.map((g) => (
        <Caja key={g.codigo} titulo={g.nombre}><ListaDocumentosEdificio docs={g.documentos} ocultarProceso={d.sin_proceso_confirmado} /></Caja>
      ))}
    </div>
  );
}
