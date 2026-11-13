"use client";
import { use } from "react";
import Link from "next/link";
import { Alert, Skeleton, Tag } from "antd";
import { useDetalleEdificio, useFichaPrecios } from "@/hooks/queries";
import { FichaPreciosEdificio } from "@/components/precios/ficha-precios";
import { BotonPdf } from "@/components/precios/comunes";
import { PENDIENTE, cop, fechaCorta } from "@/lib/format";
import { esErrorDeAcceso } from "@/lib/api";
import { SinAcceso, ErrorCarga } from "@/components/estados";
import { Volver } from "@/components/volver";
import { EstadoResolucion, ListaDocumentosEdificio } from "@/components/edificios-soportes";
import { PALETA } from "@/theme/theme";
import { SoporteLink } from "@/components/soporte-link";
import { LecturaAsistida } from "@/components/lectura-asistida";
import { agruparCotizaciones } from "@/lib/oferta";
import { direccionesPorVerificar } from "@/lib/direccion";
import { urlVisor } from "@/components/soporte-link";

const Caja = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section style={{ background: "#fff", border: `1px solid ${PALETA.borde}`, borderRadius: 8, padding: 18 }}>
    <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>{titulo}</h2>
    {children}
  </section>
);

export default function FichaEdificacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useDetalleEdificio(Number(id));
  const qf = useFichaPrecios(`e${id}`);
  if (q.isError && esErrorDeAcceso(q.error)) return <SinAcceso />;
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (q.isError || !q.data) return <ErrorCarga texto="No fue posible cargar la edificación." onReintentar={() => q.refetch()} />;
  const d = q.data;
  const discrepancias = direccionesPorVerificar(d.edificio.direccion, [...d.visitas_y_soportes_tecnicos, ...d.grupos.flatMap((g) => g.documentos)].map((x) => ({ nombre: x.nombre, version_id: x.version_id })), d.lectura_asistida ?? []);
  const resto = d.grupos.filter((g) => g.codigo !== "VISITA_SOPORTE_TECNICO");

  const tecnico = (
    <>
        <LecturaAsistida lectura={d.lectura_asistida} />

        {discrepancias.length > 0 && (
          <Alert type="warning" showIcon message="Direcciones por verificar"
            description={<>
              Dirección registrada: <strong>{d.edificio.direccion}</strong>. En los documentos constan otras; pueden ser accesos distintos al mismo predio o un error de un documento. No se cambia la dirección registrada ni se deshace ningún vínculo.
              <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                {discrepancias.map((x, k) => (
                  <li key={k}>
                    <strong>«{x.texto}»</strong> — <em>{x.documento}</em>
                    {x.origen === "PAGINA"
                      ? <> · en el contenido{x.version_id ? <>: <Link href={urlVisor(x.version_id, x.pagina)}>{x.pagina ? `pág. ${x.pagina}` : "abrir documento"}</Link></> : null}</>
                      : <> · escrita solo en el nombre del archivo (no es evidencia de la dirección)</>}
                  </li>
                ))}
              </ul>
            </>} />
        )}

        {d.sin_proceso_confirmado && (
          <Alert type="info" showIcon message="Proceso contractual por vincular" description="Aún no se ha confirmado la relación de esta edificación con un contrato. Sus visitas y cotizaciones confirmadas se pueden consultar abajo." />
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
            {agruparCotizaciones(d.cotizaciones).map((cs) => {
              const base = cs.find((c) => c.soporte.pagina !== null) ?? cs[0];
              return (
                <div key={cs[0].id} style={{ borderTop: "1px solid #E6EAF0", paddingTop: 14, marginTop: 14 }}>
                  <h3 className="largo" style={{ margin: "0 0 4px", fontSize: 17 }}>{base.proveedor}{base.referencia_oferta ? ` · ${base.referencia_oferta}` : ""}{base.fecha_oferta ? ` · ${fechaCorta(base.fecha_oferta)}` : ""}</h3>
                  <div className="importe cifra">{cop(base.importe)}</div>
                  <div className="largo" style={{ fontWeight: 600 }}>{base.concepto}</div>
                  <div className="texto-secundario" style={{ fontSize: 13.5 }}>
                    {base.base === "COSTO_DIRECTO" ? "Costo directo de esta edificación, antes de administración, imprevistos, utilidad e IVA." : "Total según la fuente."}
                  </div>
                  {(base.actividades || base.cantidad || base.tratamiento_aiu) && (
                    <ul className="largo" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14 }}>
                      {base.actividades && <li><strong>Actividades:</strong> {base.actividades}</li>}
                      {base.cantidad && <li><strong>Cantidades:</strong> {base.cantidad}</li>}
                      {base.tratamiento_aiu && <li><strong>AIU e IVA:</strong> {base.tratamiento_aiu}</li>}
                    </ul>
                  )}
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
    </>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <Volver alternativa="/analisis-precios" texto="Volver" />
          <h1 className="largo" style={{ margin: "6px 0 0", fontSize: 30 }}>{d.edificio.nombre}</h1>
          {d.edificio.direccion && <p className="texto-secundario largo" style={{ margin: "4px 0 0" }}>{d.edificio.direccion}</p>}
        </div>
        <BotonPdf href={`/api/monitoreo-contratacion/exportar/pdf/edificio/e${id}`} />
      </div>
      {qf.data
        ? <FichaPreciosEdificio ficha={qf.data} tecnico={tecnico} tecnicoEtiqueta={discrepancias.length ? `Detalles técnicos y revisión · ${discrepancias.length} ${discrepancias.length === 1 ? "dirección" : "direcciones"} por verificar` : undefined} />
        : qf.isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : <div style={{ display: "grid", gap: 20 }}>{tecnico}</div>}
    </div>
  );
}
