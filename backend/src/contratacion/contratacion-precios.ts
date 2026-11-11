/**
 * Lógica pura (sin BD) del «Análisis de precios»: qué se contrató, con qué referencias comparables se cuenta y qué
 * diferencia presenta el valor contratado frente a cada referencia válida.
 *
 * Reglas:
 * - No hay conclusión predeterminada: un precio superior a las referencias se muestra igual que uno inferior.
 * - Solo se calcula diferencia (COP y %) frente a una referencia positiva y de alcance equivalente.
 * - Las versiones de una misma oferta (mismo grupo) cuentan como un solo competidor: se usa la revisión más reciente.
 * - El presupuesto oficial construido a partir de una de las ofertas es una comparación presupuestal, no una referencia
 *   independiente de mercado.
 * - Un valor global de otro contrato o un análisis del sector no se comparan con el valor contratado salvo que la
 *   fuente documente equivalencia: se listan como «no comparables» con el motivo.
 * - No se usan umbrales porcentuales para declarar sobrecosto ni ausencia de sobrecosto.
 */

export interface SoporteRefP { documento_id: number | null; version_id: number | null; documento: string | null; pagina: number | null; hoja: string | null; celda: string | null }

export interface ContratoP { valor: number; tipo_acto: string; numero: string | null; oferta: string | null; soporte: SoporteRefP | null }
export interface OfertaP { proveedor: string; grupo_oferta: string; revision: number; valor: number | null; soporte: SoporteRefP | null }
export interface ReferenciaExternaP { entidad: string | null; objeto: string | null; valor: number | null; equivalente: boolean; motivo_no_comparable: string | null; soporte: SoporteRefP | null }
export interface EntradaPrecios {
  contratos: ContratoP[];
  ofertas: OfertaP[];
  presupuestoOficial: { importe: number; soporte: SoporteRefP | null } | null;
  referenciasExternas: ReferenciaExternaP[];
  alcance: { comparables: boolean; hay_diferencias: boolean; diferencias: Array<{ concepto: string }> };
  seleccion: { oferta: string | null; justificada: boolean };
  ejecutado: Array<{ importe: number; respaldado: boolean; soporte: SoporteRefP | null }>;
  /** Partidas de las ofertas: cuántas se pudieron comparar entre sí y cuántas hay. */
  partidas: { comparadas: number; total: number };
  /** Contexto solo para la presentación: no cambia el resultado ni las cifras. */
  contexto?: { estudio_mercado_identificado?: boolean; contrato_por_vincular?: boolean };
}

/**
 * Presentación institucional del resultado. El estado interno (`resultado`) no cambia. El tono «ATENCION» se reserva para lo que requiere atención
 * (alcance no equivalente, valores fuera del rango); un trámite pendiente se muestra como «INFORMATIVO».
 */
export interface PresentacionPrecios { etiqueta: string; detalle: string | null; tono: 'INFORMATIVO' | 'ATENCION' | 'FAVORABLE' }

export const DETALLE_ESTUDIO_MERCADO = 'Se cuenta con un estudio de mercado. La comparación se completará al incorporar la información contractual correspondiente.';

export function presentacionPrecios(resultado: ResultadoPrecio, ctx: { estudio_mercado_identificado?: boolean; contrato_por_vincular?: boolean } = {}): PresentacionPrecios {
  switch (resultado) {
    case 'SIN_CONTRATO_SOPORTADO':
      return {
        etiqueta: ctx.contrato_por_vincular ? 'Documento contractual por vincular' : 'Documentación contractual por incorporar',
        // Solo se menciona un estudio de mercado si está identificado como tal.
        detalle: ctx.estudio_mercado_identificado ? DETALLE_ESTUDIO_MERCADO : null,
        tono: 'INFORMATIVO',
      };
    case 'EVIDENCIA_INSUFICIENTE': return { etiqueta: 'Comparación de precios por completar', detalle: null, tono: 'INFORMATIVO' };
    case 'ALCANCE_NO_EQUIVALENTE': return { etiqueta: 'Alcance no equivalente: sin comparación', detalle: null, tono: 'ATENCION' };
    case 'DENTRO_DEL_RANGO': return { etiqueta: 'Dentro del rango de las referencias comparables', detalle: null, tono: 'FAVORABLE' };
    case 'POR_ENCIMA_DEL_RANGO': return { etiqueta: 'Por encima del rango de las referencias', detalle: null, tono: 'ATENCION' };
    case 'POR_DEBAJO_DEL_RANGO': return { etiqueta: 'Por debajo del rango de las referencias', detalle: null, tono: 'ATENCION' };
  }
}

export type ResultadoPrecio =
  | 'SIN_CONTRATO_SOPORTADO'
  | 'EVIDENCIA_INSUFICIENTE'
  | 'ALCANCE_NO_EQUIVALENTE'
  | 'DENTRO_DEL_RANGO'
  | 'POR_ENCIMA_DEL_RANGO'
  | 'POR_DEBAJO_DEL_RANGO';

export interface ReferenciaAnalizada {
  tipo: 'COTIZACION' | 'PRESUPUESTO_OFICIAL' | 'REFERENCIA_EXTERNA';
  etiqueta: string;
  proveedor: string | null;
  valor: number | null;
  /** Independiente = otra empresa o fuente, no derivada de lo contratado. */
  independiente: boolean;
  comparable: boolean;
  motivo: string | null;
  base: number | null;
  diferencia_cop: number | null;
  diferencia_pct: number | null;
  es_la_seleccionada: boolean;
  soporte: SoporteRefP | null;
}

const esModificacion = (t: string) => /adici|modific|otros[ií]|mayor(?:es)?\s+cantidad/i.test(t);
const redondeo = (n: number) => Math.round(n * 100) / 100;

export function desgloseContratado(contratos: ContratoP[]) {
  const inicial = contratos.filter((c) => !esModificacion(c.tipo_acto));
  const mods = contratos.filter((c) => esModificacion(c.tipo_acto));
  const suma = (xs: ContratoP[]) => xs.reduce((s, c) => s + c.valor, 0);
  return {
    valor_inicial: inicial.length ? suma(inicial) : null,
    modificaciones: mods.length ? suma(mods) : null,
    valor_actualizado: contratos.length ? suma(contratos) : null,
    detalle: contratos.map((c) => ({ tipo_acto: c.tipo_acto, numero: c.numero, valor: c.valor, es_modificacion: esModificacion(c.tipo_acto), soporte: c.soporte })),
  };
}

/** Una oferta por grupo (la revisión más reciente); las anteriores no son competidores distintos. */
export function ofertasVigentes(ofertas: OfertaP[]): OfertaP[] {
  const por = new Map<string, OfertaP>();
  for (const o of ofertas) {
    const previa = por.get(o.grupo_oferta);
    if (!previa || o.revision > previa.revision) por.set(o.grupo_oferta, o);
  }
  return [...por.values()];
}

const diff = (contratado: number, ref: number | null) =>
  ref !== null && ref > 0 ? { cop: redondeo(contratado - ref), pct: redondeo(((contratado - ref) / ref) * 100) } : { cop: null, pct: null };

export function analizarPrecios(e: EntradaPrecios) {
  const desglose = desgloseContratado(e.contratos);
  const contratado = desglose.valor_actualizado;
  const base = desglose.valor_inicial ?? contratado; // se contrasta lo contratado inicialmente; las modificaciones se muestran aparte
  const vigentes = ofertasVigentes(e.ofertas).filter((o) => o.valor !== null);
  const proveedoresSel = new Set([...(e.seleccion.oferta ? [e.seleccion.oferta] : []), ...e.contratos.map((c) => c.oferta).filter(Boolean) as string[]]);
  const alcanceOk = e.alcance.comparables && !e.alcance.hay_diferencias;

  const referencias: ReferenciaAnalizada[] = [];
  for (const o of vigentes) {
    const sel = proveedoresSel.has(o.proveedor);
    const d = base !== null && !sel ? diff(base, o.valor) : { cop: null, pct: null };
    referencias.push({
      tipo: 'COTIZACION',
      etiqueta: sel ? `Oferta seleccionada · ${o.proveedor}` : `Cotización · ${o.proveedor}`,
      proveedor: o.proveedor, valor: o.valor, independiente: true,
      comparable: !sel && alcanceOk,
      motivo: sel ? 'Es la oferta que se contrató: no se contrasta consigo misma.' : alcanceOk ? null : 'El alcance de las ofertas no está verificado como equivalente.',
      base: !sel && alcanceOk ? o.valor : null,
      diferencia_cop: !sel && alcanceOk ? d.cop : null, diferencia_pct: !sel && alcanceOk ? d.pct : null,
      es_la_seleccionada: sel, soporte: o.soporte,
    });
  }
  if (e.presupuestoOficial) {
    const derivado = vigentes.some((o) => Math.abs((o.valor ?? 0) - e.presupuestoOficial!.importe) <= 0.5);
    const d = base !== null ? diff(base, e.presupuestoOficial.importe) : { cop: null, pct: null };
    referencias.push({
      tipo: 'PRESUPUESTO_OFICIAL', etiqueta: 'Presupuesto oficial', proveedor: null, valor: e.presupuestoOficial.importe,
      independiente: false, comparable: base !== null && alcanceOk,
      motivo: derivado ? 'Coincide con el valor de una de las ofertas: se construyó a partir de ella. Es una comparación presupuestal, no una segunda referencia independiente de mercado.' : 'Comparación presupuestal; no es una referencia independiente de mercado.',
      base: e.presupuestoOficial.importe, diferencia_cop: d.cop, diferencia_pct: d.pct, es_la_seleccionada: false, soporte: e.presupuestoOficial.soporte,
    });
  }
  for (const r of e.referenciasExternas) {
    const ok = r.equivalente && r.valor !== null && r.valor > 0;
    const d = ok && base !== null ? diff(base, r.valor) : { cop: null, pct: null };
    referencias.push({
      tipo: 'REFERENCIA_EXTERNA', etiqueta: `Referencia externa${r.entidad ? ` · ${r.entidad}` : ''}`, proveedor: r.entidad, valor: r.valor, independiente: true,
      comparable: ok, motivo: ok ? null : r.motivo_no_comparable ?? 'Valor global de otro contrato o estudio: la fuente no documenta equivalencia de alcance, unidad ni cantidades.',
      base: ok ? r.valor : null, diferencia_cop: d.cop, diferencia_pct: d.pct, es_la_seleccionada: false, soporte: r.soporte,
    });
  }

  // Referencias independientes y comparables (excluye la oferta seleccionada y el presupuesto oficial).
  const validas = referencias.filter((r) => r.independiente && r.comparable && r.valor !== null && !r.es_la_seleccionada);
  const competidoras = vigentes.length;
  let resultado: ResultadoPrecio;
  let rango: { min: number; max: number; referencias: number } | null = null;
  if (contratado === null || base === null) resultado = 'SIN_CONTRATO_SOPORTADO';
  else if (competidoras >= 2 && !alcanceOk && validas.length === 0) resultado = 'ALCANCE_NO_EQUIVALENTE';
  else if (validas.length < 2) resultado = 'EVIDENCIA_INSUFICIENTE';
  else {
    const valores = validas.map((r) => r.valor as number);
    const min = Math.min(...valores), max = Math.max(...valores);
    rango = { min, max, referencias: validas.length };
    resultado = base > max ? 'POR_ENCIMA_DEL_RANGO' : base < min ? 'POR_DEBAJO_DEL_RANGO' : 'DENTRO_DEL_RANGO';
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  const justificado = e.seleccion.justificada;
  let resumen: string;
  switch (resultado) {
    case 'SIN_CONTRATO_SOPORTADO':
      resumen = e.contexto?.contrato_por_vincular
        ? 'El documento contractual ya está cargado, pero falta vincularlo con este proceso. Hasta completar la comparación no se afirma si el precio se ubica dentro de referencias comparables.'
        : 'Documentación contractual por incorporar (contrato, acto de adjudicación o acta que acredite el valor contratado). Hasta entonces no se afirma si el precio se ubica dentro de referencias comparables.';
      break;
    case 'ALCANCE_NO_EQUIVALENTE':
      resumen = `Hay ${competidoras} ofertas, pero no cubren el mismo alcance (${e.alcance.diferencias.map((d) => d.concepto.toLowerCase()).join(', ') || 'diferencias por aclarar'}): no se calculan diferencias hasta explicarlo.`;
      break;
    case 'EVIDENCIA_INSUFICIENTE':
      resumen = `Comparación de precios por completar: se cuenta con ${validas.length === 0 ? 'ninguna referencia independiente y comparable' : 'una sola referencia independiente y comparable'} frente a lo contratado (${fmt(base!)}). No se concluye sobre el precio mientras no haya al menos dos referencias independientes y comparables.`;
      break;
    case 'DENTRO_DEL_RANGO':
      resumen = `El valor contratado (${fmt(base!)}) se ubica dentro del rango de ${rango!.referencias} referencias independientes y comparables (${fmt(rango!.min)} a ${fmt(rango!.max)}), con alcance verificado como equivalente.`;
      break;
    case 'POR_ENCIMA_DEL_RANGO':
      resumen = `El valor contratado (${fmt(base!)}) supera el rango de ${rango!.referencias} referencias comparables (${fmt(rango!.min)} a ${fmt(rango!.max)}) en ${fmt(base! - rango!.max)} frente a la más alta. ${justificado ? 'Hay una justificación documentada de la selección; revísela.' : 'No hay una justificación documentada de la diferencia.'}`;
      break;
    case 'POR_DEBAJO_DEL_RANGO':
      resumen = `El valor contratado (${fmt(base!)}) es inferior al rango de ${rango!.referencias} referencias comparables (${fmt(rango!.min)} a ${fmt(rango!.max)}). Verifique que el alcance contratado sea el mismo.`;
      break;
  }

  const pendientes: string[] = [];
  if (contratado === null) pendientes.push(e.contexto?.contrato_por_vincular ? 'Vincular al proceso el documento contractual ya cargado' : 'Contrato, acta de adjudicación u oferta aceptada firmada del proceso');
  if (competidoras < 2) pendientes.push('Otras cotizaciones independientes para la misma intervención');
  if (competidoras >= 2 && !alcanceOk) pendientes.push('Aclaración de las diferencias de alcance entre las ofertas');
  if (!e.seleccion.justificada && contratado !== null) pendientes.push('Justificación documentada de la selección de la oferta');
  if (e.referenciasExternas.length === 0) pendientes.push('Estudio de mercado o referencia de precios documentada (con fecha, ubicación, actividad, unidad y alcance)');
  if (contratado !== null && !e.ejecutado.some((x) => x.respaldado)) pendientes.push('Actas de ejecución o soportes de pago');

  const ejecutadoRespaldado = e.ejecutado.filter((x) => x.respaldado).reduce((s, x) => s + x.importe, 0);
  return {
    contratado: { ...desglose, sustentado: contratado !== null },
    referencias,
    rango,
    resultado,
    presentacion: presentacionPrecios(resultado, e.contexto),
    resumen,
    cobertura: { partidas_comparadas: e.partidas.comparadas, partidas_totales: e.partidas.total, aviso: e.partidas.total === 0 ? 'No hay partidas con precio unitario: la conclusión aplica solo al valor global.' : e.partidas.comparadas < e.partidas.total ? 'Solo algunas partidas son comparables: la conclusión no se extiende al contrato completo.' : null },
    ejecutado_vs_contratado: contratado !== null && ejecutadoRespaldado > 0 ? { ejecutado: ejecutadoRespaldado, diferencia_cop: redondeo(ejecutadoRespaldado - contratado), nota: 'Puede deberse a cantidades o alcance, no necesariamente al precio unitario.' } : null,
    pendientes,
  };
}

/** Clasificación de la intervención para no mezclar el izaje con grúas con las demoliciones en los totales. */
export function tipoIntervencion(intervencion: string): 'DEMOLICION' | 'IZAJE_GRUAS' | 'OTRA' {
  if (/gr[uú]as?|izaje/i.test(intervencion) && !/demolici/i.test(intervencion)) return 'IZAJE_GRUAS';
  if (/demolici|derribo|implosi|rcd|escombr/i.test(intervencion)) return 'DEMOLICION';
  return 'OTRA';
}
