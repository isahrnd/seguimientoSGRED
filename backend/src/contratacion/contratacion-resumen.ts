/**
 * Resumen por contrato para exportar a Excel. Funciones puras: cada cifra viaja con su fuente en texto
 * («Documento, p. N» o «Hoja COMPRAS, celda F6») y lo que falta se declara como pendiente, nunca se infiere.
 */

export interface SoporteTexto { documento?: string | null; pagina?: number | null; hoja?: string | null; celda?: string | null }

export const fuenteTexto = (s: SoporteTexto | null | undefined): string => {
  if (!s) return '';
  const lugar = s.celda ? `${s.hoja ? `hoja ${s.hoja}, ` : ''}celda ${s.celda}` : s.pagina ? `p. ${s.pagina}` : s.hoja ? `hoja ${s.hoja}` : '';
  return [s.documento, lugar].filter(Boolean).join(', ');
};


export interface FilaResumen {
  proceso: string;
  contrato: string;
  intervencion: string;
  edificaciones: string;
  contratista: string;
  estado: string;
  valor_matriz: number | null;
  fuente_matriz: string;
  valor_contrato: number | null;
  fuente_contrato: string;
  valor_ejecutado: number | null;
  fuente_ejecutado: string;
  presupuesto_oficial: number | null;
  fuente_presupuesto: string;
  area_m2: number | null;
  precio_m2: number | null;
  nota_m2: string;
  pendientes: string;
  observacion: string;
}

const ESTADOS: Record<string, string> = {
  CONTRATADO: 'Contrato en soporte', EJECUCION_DOCUMENTADA: 'Ejecución documentada', ANALISIS_DEL_SECTOR: 'Análisis del sector', PENDIENTE_SOPORTE: 'Pendiente de soporte',
};

/** `d` es el detalle de un expediente (ContratacionConsultaService.detalle). El importe del contrato y el de la matriz no se suman. */
export function filaResumen(d: any): FilaResumen {
  const exp = d.expediente;
  const contratos: any[] = d.contratacion?.contratos ?? [];
  const rep = d.matriz?.valor_reportado ?? null;
  const oficial = (d.valores ?? []).find((v: any) => v.tipo === 'PRESUPUESTO_OFICIAL') ?? null;
  const ejecutados = (d.ejecucion?.valores ?? []).filter((v: any) => v.estado_soporte === 'RESPALDADO');
  const total = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) : null);
  const valorContrato = total(contratos.map((c) => c.valor as number));
  const valorEjec = total(ejecutados.map((v: any) => v.importe as number));
  const edificios: string[] = exp.edificaciones ?? [];
  // La superficie viene solo de un documento que la declara de forma expresa, con su fuente (ver areaParaPrecio); nunca de las partidas.
  const ap = d.area_precio ?? null;
  const area: number | null = ap?.estado === 'DOCUMENTADA' ? ap.valor : null;
  const base = valorContrato ?? oficial?.importe ?? null;
  let precio: number | null = null;
  let nota = '';
  if (exp.tipo_intervencion === 'IZAJE_GRUAS') nota = 'No aplica: servicio por unidad de equipo';
  else if (area === null) nota = ap?.motivo ?? 'Superficie pendiente de documentar';
  else if (base !== null) { precio = Math.round(base / area); nota = `Calculado: ${valorContrato !== null ? 'valor del contrato' : 'presupuesto oficial'} ÷ superficie documentada (${fuenteTexto(ap.soporte)})`; }
  const obs: string[] = [];
  if (rep && contratos.length === 0) obs.push('Contrato pendiente de vincular');
  if (rep && contratos.length && !rep.coincide_con_contrato) obs.push('El valor de la matriz difiere del contrato');
  if (rep && contratos.length && rep.coincide_con_contrato) obs.push('Misma cifra en matriz y contrato: cuenta una sola vez');
  if (rep && oficial && contratos.length === 0 && Math.abs(rep.importe - oficial.importe) < 0.5) obs.push('El valor de la matriz es igual al presupuesto oficial');
  return {
    proceso: exp.proceso, contrato: exp.numero_contrato ?? '', intervencion: exp.intervencion ?? '', edificaciones: edificios.join('; '),
    contratista: contratos.map((c) => c.contratista).filter(Boolean)[0] ?? d.comparacion?.seleccion?.oferta ?? '',
    estado: ESTADOS[exp.estado] ?? exp.estado,
    valor_matriz: rep?.importe ?? null, fuente_matriz: rep ? `Fuente: matriz de contratación. ${fuenteTexto(rep.soporte)}` : '',
    valor_contrato: valorContrato, fuente_contrato: contratos.map((c) => fuenteTexto(c.soporte)).filter(Boolean).join(' | '),
    valor_ejecutado: valorEjec, fuente_ejecutado: ejecutados.map((v: any) => fuenteTexto(v.soporte)).filter(Boolean).join(' | '),
    presupuesto_oficial: oficial?.importe ?? null, fuente_presupuesto: fuenteTexto(oficial?.soporte),
    area_m2: area, precio_m2: precio, nota_m2: nota,
    pendientes: (exp.pendientes ?? []).join('; '), observacion: obs.join('. '),
  };
}
