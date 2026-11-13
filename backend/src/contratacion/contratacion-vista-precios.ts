/**
 * Vista de precios POR EDIFICIO: lógica pura (sin BD) compartida por la pantalla, el Excel y el PDF, de modo que las mismas cifras y fórmulas
 * alimenten las tres salidas.
 *
 * Reglas:
 * - La procedencia de cada valor es visible y no se mezcla: CONTRATO (respaldado), CONSOLIDADO (reportado), MATRIZ, PRESUPUESTO, COTIZACION.
 * - El valor de un contrato que cubre varios edificios NO se asigna a cada edificio ni se reparte sin un desglose documentado.
 * - El estado «CONTRATADO» del consolidado no verifica un contrato firmado.
 * - «Valor contratado por m²» solo con importe contractual de un único edificio y superficie documentada; si no, el cociente del consolidado se
 *   muestra como «reportado», con su fuente.
 * - Subtotales y totales no se suman a sus componentes; las cantidades de actividades no son superficie del edificio.
 * - Las diferencias entre fuentes se muestran sin atribuirles una causa que no conste.
 */
export type Procedencia = 'CONTRATO' | 'CONSOLIDADO' | 'MATRIZ' | 'PRESUPUESTO' | 'COTIZACION';

export interface FuenteDato { version_id: number | null; documento: string | null; pagina: number | null; hoja: string | null; celda: string | null }

export const ETQ_PROCEDENCIA: Record<Procedencia, string> = {
  CONTRATO: 'Contrato', CONSOLIDADO: 'Consolidado', MATRIZ: 'Matriz', PRESUPUESTO: 'Presupuesto', COTIZACION: 'Cotización',
};

export const fechaCorteTexto = (iso: string | null | undefined) => {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
export const etiquetaConsolidado = (corte: string | null | undefined) => (corte ? `Según consolidado del ${fechaCorteTexto(corte)}` : 'Según consolidado');

import { construirEjecutiva, type FilaEjecutiva } from './contratacion-ficha-ejecutiva';

export interface DatoValor { valor: number; procedencia: Procedencia; etiqueta: string; fuente: FuenteDato | null; nota: string | null }

export interface ContratoEntrada { valor: number; tipo_acto: string; numero: string | null; contratista: string | null; soporte: FuenteDato | null }
export interface ProcesoEntrada {
  id: number; proceso: string; numero_contrato: string | null; intervencion: string | null; edificios_del_proceso: number;
  contratos: ContratoEntrada[];
  reportado_matriz: { importe: number; soporte: FuenteDato | null } | null;
  presupuesto_oficial: { importe: number; soporte: FuenteDato | null } | null;
}
export interface ConsolidadoEntrada {
  id: number; nombre: string; direccion: string | null; estado: string | null; avance: string | null; valor: number | null; area_m2: number | null; valor_m2: number | null;
  responsable: string | null; formula_valor: string | null; fecha_corte: string | null; vinculo: string | null;
  fuentes: { valor: FuenteDato | null; area_m2: FuenteDato | null; valor_m2: FuenteDato | null; responsable: FuenteDato | null; estado: FuenteDato | null };
}
export interface AreaDocumentadaEntrada { valor: number; tipo: string; cita: string; fuente: FuenteDato | null }

export type NivelOferta = 'COSTO_DIRECTO' | 'TOTAL' | 'NO_ESPECIFICADO';
export interface ItemOferta { actividad: string; unidad: string | null; cantidad: number | null; precio_unitario: number | null; subtotal: number | null; nivel: string; fuente: FuenteDato | null }
export interface OfertaEdificio {
  empresa: string; documento: string; version_id: number | null; etapa: 'COTIZACION'; fecha: string | null; referencia: string | null;
  nivel: NivelOferta; items: ItemOferta[];
  componentes: { costo_directo: number | null; administracion: number | null; imprevistos: number | null; utilidad: number | null; iva: number | null; total: number | null };
  fuentes_componentes: Record<string, FuenteDato | null>;
  alcance: string | null;
  /** Entre ofertas de la misma empresa con fechas distintas: la más antigua es ANTERIOR y la más reciente POSTERIOR. Nunca implica que sea la seleccionada o la contratada. */
  secuencia: 'ANTERIOR' | 'POSTERIOR' | null;
  /** Lo que la oferta declara sobre otras versiones, cuando consta. */
  nota_version: string | null;
  /** Total de una oferta que cubre varios edificios (no es el valor de este edificio). */
  oferta_conjunta: { edificios: number; total: number | null } | null;
  relacion: string;
  controles: Array<{ control: string; estado: string; diferencia: number }>;
}
export interface Etapa { etapa: string; fecha: string | null; valor: number; procedencia: Procedencia; fuente: FuenteDato | null; nivel: string | null }

export interface EntradaFila {
  edificio: { id: number | null; nombre: string; direccion: string | null };
  consolidado: ConsolidadoEntrada | null;
  procesos: ProcesoEntrada[];
  area_documentada: AreaDocumentadaEntrada | null;
  ofertas: OfertaEdificio[];
  contrato_por_vincular: boolean;
  analisis_sector: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Pesos a la colombiana, con centavos solo cuando existen. */
export const cop = (n: number) => `$${n.toLocaleString('es-CO', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const m2fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
const esModificacion = (t: string) => /adici|modific|otros[ií]|mayor(?:es)?\s+cantidad/i.test(t);
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function desgloseContratos(cs: ContratoEntrada[]) {
  const inicial = cs.filter((c) => !esModificacion(c.tipo_acto));
  return { valor_inicial: inicial.length ? suma(inicial.map((c) => c.valor)) : null, valor_actualizado: cs.length ? suma(cs.map((c) => c.valor)) : null };
}

export const ETQ_ESTADO_CONSOLIDADO: Record<string, string> = { CONTRATADO: 'Contratado', 'POR CONTRATAR': 'Por contratar' };
const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export interface FilaEdificio {
  clave: string;
  edificio_id: number | null;
  nombre: string;
  direccion: string | null;
  responsable: { nombre: string; procedencia: Procedencia; etiqueta: string; fuente: FuenteDato | null } | null;
  valor: DatoValor | null;
  /** Otros valores disponibles de fuentes distintas; nunca se suman al principal. */
  valores_alternos: DatoValor[];
  contrato_conjunto: { proceso: string; contrato: string | null; valor: number; edificios: number; soporte: FuenteDato | null; nota: string } | null;
  area: { valor: number; clase: 'DOCUMENTADA' | 'REPORTADA'; etiqueta: string; fuente: FuenteDato | null } | null;
  valor_m2: { valor: number; clase: 'CONTRATADO' | 'REPORTADO'; etiqueta: string; fuente: FuenteDato | null; nota: string | null } | null;
  estado: { etiqueta: string; consolidado: string | null; avance: string | null };
  documento_contractual: 'RESPALDADO' | 'CONJUNTO' | 'POR_INCORPORAR' | 'POR_VINCULAR' | 'NO_APLICA';
  mensajes: string[];
  diferencias: string[];
  ofertas: OfertaEdificio[];
  comparacion: Comparacion;
  etapas: Etapa[];
  etapas_comparables: boolean;
  procesos: Array<{ id: number; proceso: string; numero_contrato: string | null }>;
  /** Orden de la fila en el consolidado (para presentar los edificios en el orden del reporte); null si no figura en él. */
  consolidado_id: number | null;
  /** Capa ejecutiva (la misma para pantalla y PDF): oferta mostrada, comparación resumida, nota única, enlace al contrato y diferencias. */
  ejecutivo: FilaEjecutiva;
}

export interface Comparacion {
  disponible: boolean;
  niveles: Array<{ nivel: NivelOferta; etiqueta: string; ofertas: Array<{ empresa: string; /** Empresa con su referencia y fecha cuando hay varias versiones. */ etiqueta: string; valor: number; fecha: string | null; fuente: FuenteDato | null; secuencia: 'ANTERIOR' | 'POSTERIOR' | null }>; minimo: number; maximo: number; diferencia: number }>;
  nota: string;
}
const ETQ_NIVEL: Record<NivelOferta, string> = { COSTO_DIRECTO: 'Costo directo', TOTAL: 'Total de la oferta', NO_ESPECIFICADO: 'Importe (nivel no especificado)' };

/** Compara ofertas del mismo edificio solo dentro del mismo nivel (costo directo con costo directo, total con total). No emite veredictos. */
export function compararOfertas(ofertas: OfertaEdificio[]): Comparacion {
  const niveles: Comparacion['niveles'] = [];
  const valorDe = (o: OfertaEdificio, nivel: NivelOferta): number | null => {
    if (nivel === 'COSTO_DIRECTO') return o.componentes.costo_directo;
    if (nivel === 'TOTAL') return o.componentes.total;
    return o.nivel === 'NO_ESPECIFICADO' ? (o.items.length ? r2(suma(o.items.map((i) => i.subtotal ?? 0))) : null) : null;
  };
  for (const nivel of ['COSTO_DIRECTO', 'TOTAL', 'NO_ESPECIFICADO'] as NivelOferta[]) {
    const por = new Map<string, Comparacion['niveles'][number]['ofertas'][number]>();
    for (const o of ofertas) {
      const v = valorDe(o, nivel);
      if (v === null || !(v > 0)) continue;
      const k = `${o.empresa}|${o.documento}|${o.version_id ?? ''}`;
      const varias = ofertas.filter((x) => x.empresa === o.empresa).length > 1;
      por.set(k, { empresa: o.empresa, etiqueta: varias ? `${o.empresa} · ${o.referencia ? `${o.referencia}, ` : ''}${o.fecha ? fechaCorteTexto(o.fecha) : o.documento}` : o.empresa, secuencia: o.secuencia, valor: v, fecha: o.fecha, fuente: o.fuentes_componentes[nivel === 'TOTAL' ? 'total' : 'costo_directo'] ?? { version_id: o.version_id, documento: o.documento, pagina: null, hoja: null, celda: null } });
    }
    const lista = [...por.values()].sort((a, b) => a.valor - b.valor);
    const empresas = new Set(lista.map((x) => x.empresa));
    if (empresas.size >= 2) niveles.push({ nivel, etiqueta: ETQ_NIVEL[nivel], ofertas: lista, minimo: lista[0].valor, maximo: lista[lista.length - 1].valor, diferencia: r2(lista[lista.length - 1].valor - lista[0].valor) });
  }
  return {
    disponible: niveles.length > 0, niveles,
    nota: niveles.length
      ? 'Comparación disponible para las actividades documentadas. Cada cifra se compara solo con otra del mismo nivel; no es un veredicto sobre el precio.'
      : 'No hay dos ofertas del mismo nivel para este edificio.',
  };
}

/** Marca, por empresa, cuál oferta es anterior y cuál posterior (solo por fecha; no equivale a seleccionada ni contratada). */
export function marcarSecuencia(ofertas: OfertaEdificio[]): OfertaEdificio[] {
  const porEmpresa = new Map<string, OfertaEdificio[]>();
  for (const o of ofertas) porEmpresa.set(o.empresa, [...(porEmpresa.get(o.empresa) ?? []), o]);
  const salida = ofertas.map((o) => ({ ...o }));
  for (const lista of porEmpresa.values()) {
    const fechas = [...new Set(lista.map((o) => o.fecha).filter(Boolean) as string[])].sort();
    if (fechas.length < 2) continue;
    for (const o of salida) if (o.empresa === lista[0].empresa && o.fecha) o.secuencia = o.fecha === fechas[fechas.length - 1] ? 'POSTERIOR' : 'ANTERIOR';
  }
  return salida.sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.empresa.localeCompare(b.empresa));
}

export function construirFila(e0: EntradaFila): FilaEdificio {
  const e = { ...e0, ofertas: marcarSecuencia(e0.ofertas) };
  const c = e.consolidado;
  const conContrato = e.procesos.filter((p) => p.contratos.length > 0);
  const unico = conContrato.find((p) => p.edificios_del_proceso === 1) ?? null;
  const conjuntos = conContrato.filter((p) => p.edificios_del_proceso > 1);
  const valores: DatoValor[] = [];
  const diferencias: string[] = [];
  const difs: Array<{ texto: string; corto: string; magnitud: number }> = [];
  const anotar = (texto: string, corto: string, magnitud: number) => { diferencias.push(texto); difs.push({ texto, corto, magnitud }); };
  const mensajes: string[] = [];

  // --- valores disponibles, cada uno con su procedencia
  if (unico) {
    const d = desgloseContratos(unico.contratos);
    valores.push({ valor: d.valor_actualizado!, procedencia: 'CONTRATO', etiqueta: 'Contrato', fuente: unico.contratos[0].soporte, nota: d.valor_inicial !== null && d.valor_inicial !== d.valor_actualizado ? `Valor inicial ${cop(d.valor_inicial)}` : null });
  }
  if (c?.valor != null) {
    valores.push({ valor: c.valor, procedencia: 'CONSOLIDADO', etiqueta: etiquetaConsolidado(c.fecha_corte), fuente: c.fuentes.valor, nota: c.formula_valor ? `Calculado en el consolidado (${c.formula_valor.replace(/^\+/, '')})` : null });
  }
  for (const p of e.procesos) {
    if (p.contratos.length === 0 && p.reportado_matriz) valores.push({ valor: p.reportado_matriz.importe, procedencia: 'MATRIZ', etiqueta: 'Según matriz de contratación', fuente: p.reportado_matriz.soporte, nota: `Proceso ${p.proceso}` });
    if (p.presupuesto_oficial && p.edificios_del_proceso === 1) valores.push({ valor: p.presupuesto_oficial.importe, procedencia: 'PRESUPUESTO', etiqueta: 'Presupuesto oficial', fuente: p.presupuesto_oficial.soporte, nota: `Proceso ${p.proceso}` });
  }
  const principal = valores.find((v) => v.procedencia === 'CONTRATO') ?? valores.find((v) => v.procedencia === 'CONSOLIDADO') ?? valores.find((v) => v.procedencia === 'PRESUPUESTO') ?? valores.find((v) => v.procedencia === 'MATRIZ') ?? null;
  const alternos = valores.filter((v) => v !== principal);

  // --- diferencias entre fuentes (sin explicación inventada)
  for (const a of alternos) {
    if (!principal) break;
    const dif = r2(principal.valor - a.valor);
    if (Math.abs(dif) >= 0.005) anotar(`${principal.etiqueta}: ${cop(principal.valor)} y ${a.etiqueta.toLowerCase()}: ${cop(a.valor)}; diferencia de ${cop(Math.abs(dif))}. No consta la causa de la diferencia en los documentos.`, `Valor distinto según la fuente: ${principal.etiqueta.toLowerCase()} ${cop(principal.valor)} y ${a.etiqueta.toLowerCase()} ${cop(a.valor)}.`, Math.abs(dif));
  }

  // --- contrato que cubre varios edificios: se muestra como tal
  let conjunto: FilaEdificio['contrato_conjunto'] = null;
  if (conjuntos.length) {
    const p = conjuntos[0];
    conjunto = { proceso: p.proceso, contrato: p.numero_contrato, valor: desgloseContratos(p.contratos).valor_actualizado!, edificios: p.edificios_del_proceso, soporte: p.contratos[0].soporte, nota: 'Contrato conjunto: su valor corresponde a todas las edificaciones del contrato y no se divide sin un desglose documentado.' };
  }

  // --- superficie
  let area: FilaEdificio['area'] = null;
  if (e.area_documentada) area = { valor: e.area_documentada.valor, clase: 'DOCUMENTADA', etiqueta: 'Área documentada', fuente: e.area_documentada.fuente };
  else if (c?.area_m2 != null) area = { valor: c.area_m2, clase: 'REPORTADA', etiqueta: etiquetaConsolidado(c.fecha_corte), fuente: c.fuentes.area_m2 };
  if (e.area_documentada && c?.area_m2 != null && Math.abs(e.area_documentada.valor - c.area_m2) >= 0.005) {
    anotar(`Área documentada ${m2fmt(e.area_documentada.valor)} m² y área del consolidado ${m2fmt(c.area_m2)} m²; no consta cuál corresponde al alcance contratado.`, `Área distinta según la fuente: documentada ${m2fmt(e.area_documentada.valor)} m² y consolidado ${m2fmt(c.area_m2)} m².`, 1e6);
  }

  // --- valor por m²
  let m2: FilaEdificio['valor_m2'] = null;
  if (principal?.procedencia === 'CONTRATO' && e.area_documentada) {
    m2 = { valor: r2(principal.valor / e.area_documentada.valor), clase: 'CONTRATADO', etiqueta: 'Valor contratado por m²', fuente: principal.fuente, nota: 'Importe contractual ÷ superficie documentada.' };
  } else if (c?.valor != null && c.area_m2 != null && c.area_m2 > 0) {
    const calculado = r2(c.valor / c.area_m2);
    const reportado = c.valor_m2 ?? calculado;
    m2 = { valor: r2(reportado), clase: 'REPORTADO', etiqueta: `Valor por m² reportado (${etiquetaConsolidado(c.fecha_corte).toLowerCase()})`, fuente: c.fuentes.valor_m2 ?? c.fuentes.valor, nota: Math.abs(calculado - reportado) > 0.5 ? `El cociente valor ÷ área es ${cop(calculado)}; el consolidado reporta ${cop(reportado)}.` : 'Indicador reportado; no verifica que el área corresponda al alcance contratado.' };
    if (Math.abs(calculado - reportado) > 0.5) anotar(`Valor por m² del consolidado (${cop(reportado)}) distinto del cociente valor ÷ área (${cop(calculado)}).`, `El valor por m² del consolidado (${cop(reportado)}) difiere del cociente valor ÷ área (${cop(calculado)}).`, Math.abs(calculado - reportado));
  }

  // --- responsable
  let responsable: FilaEdificio['responsable'] = null;
  if (c?.responsable) responsable = { nombre: c.responsable, procedencia: 'CONSOLIDADO', etiqueta: etiquetaConsolidado(c.fecha_corte), fuente: c.fuentes.responsable };
  else {
    const k = (unico ?? conjuntos[0])?.contratos.find((x) => x.contratista);
    if (k) responsable = { nombre: k.contratista!, procedencia: 'CONTRATO', etiqueta: 'Contrato', fuente: k.soporte };
  }

  // --- documento contractual y estado
  const documento_contractual: FilaEdificio['documento_contractual'] = unico ? 'RESPALDADO' : conjuntos.length ? 'CONJUNTO'
    : e.contrato_por_vincular ? 'POR_VINCULAR'
    : (c?.estado === 'CONTRATADO' || e.procesos.length > 0) ? 'POR_INCORPORAR' : 'NO_APLICA';
  const estCons = c?.estado ? (ETQ_ESTADO_CONSOLIDADO[c.estado.toUpperCase()] ?? titulo(c.estado)) : null;
  const estado = {
    etiqueta: unico ? 'Contrato respaldado' : conjuntos.length ? 'Contrato conjunto' : estCons ? `${estCons} (consolidado)` : e.procesos.length ? 'Proceso en trámite' : 'Sin proceso asociado',
    consolidado: estCons, avance: c?.avance ? titulo(c.avance) : null,
  };
  if (documento_contractual === 'POR_VINCULAR') mensajes.push('Documento contractual por vincular');
  else if (documento_contractual === 'POR_INCORPORAR') mensajes.push('Documento contractual por incorporar');
  if (!area) mensajes.push('Área por precisar');
  if (e.analisis_sector) mensajes.push('Se cuenta con análisis del sector');

  // --- ofertas y etapas
  const comparacion = compararOfertas(e.ofertas);
  const etapas: Etapa[] = [];
  for (const o of e.ofertas) {
    const v = o.componentes.total ?? o.componentes.costo_directo;
    if (v) etapas.push({ etapa: `Cotización · ${o.empresa}`, fecha: o.fecha, valor: v, procedencia: 'COTIZACION', fuente: o.fuentes_componentes[o.componentes.total ? 'total' : 'costo_directo'] ?? null, nivel: o.componentes.total ? 'Total de la oferta' : 'Costo directo' });
  }
  for (const p of e.procesos) if (p.presupuesto_oficial && p.edificios_del_proceso === 1) etapas.push({ etapa: 'Presupuesto oficial', fecha: null, valor: p.presupuesto_oficial.importe, procedencia: 'PRESUPUESTO', fuente: p.presupuesto_oficial.soporte, nivel: null });
  if (unico) etapas.push({ etapa: 'Contrato', fecha: null, valor: desgloseContratos(unico.contratos).valor_actualizado!, procedencia: 'CONTRATO', fuente: unico.contratos[0].soporte, nivel: null });
  if (c?.valor != null) etapas.push({ etapa: 'Consolidado', fecha: c.fecha_corte, valor: c.valor, procedencia: 'CONSOLIDADO', fuente: c.fuentes.valor, nivel: null });
  // La evolución solo se grafica cuando hay al menos dos etapas y TODAS declaran el mismo nivel (p. ej. total de la oferta): el consolidado o un contrato no
  // declaran si incluyen AIU e IVA, así que no se grafican junto a una cotización.
  const niveles = new Set(etapas.map((x) => x.nivel));
  const etapas_comparables = etapas.length >= 2 && niveles.size === 1 && !niveles.has(null);

  const propio = unico ? { p: unico, conjunto: false } : conjuntos[0] ? { p: conjuntos[0], conjunto: true } : null;
  const ejecutivo = construirEjecutiva({
    fila: { valor: principal, area, valor_m2: m2, responsable, documento_contractual, contrato_conjunto: conjunto, ofertas: e.ofertas },
    contrato: propio ? { fuente: propio.p.contratos[0].soporte, conjunto: propio.conjunto, proceso: propio.p.proceso, proceso_id: propio.p.id } : null,
    diferencias: difs,
  });

  return {
    clave: e.edificio.id != null ? `e${e.edificio.id}` : `c${c?.id ?? e.edificio.nombre}`,
    edificio_id: e.edificio.id, nombre: e.edificio.nombre, direccion: e.edificio.direccion ?? c?.direccion ?? null,
    responsable, valor: principal, valores_alternos: alternos, contrato_conjunto: conjunto, area, valor_m2: m2, estado, documento_contractual, mensajes, diferencias,
    ofertas: e.ofertas, comparacion, etapas, etapas_comparables, procesos: e.procesos.map((p) => ({ id: p.id, proceso: p.proceso, numero_contrato: p.numero_contrato })),
    consolidado_id: c?.id ?? null, ejecutivo,
  };
}
