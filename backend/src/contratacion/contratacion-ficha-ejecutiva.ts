import type { FilaEdificio, FuenteDato, OfertaEdificio } from './contratacion-vista-precios';

/**
 * Capa ejecutiva de la ficha de un edificio: decide, UNA sola vez y con reglas deterministas, qué ve la persona que consulta
 * (oferta mostrada en el desglose, comparación resumida, nota breve, enlace al contrato y diferencias). La pantalla y el PDF consumen este
 * mismo resultado; nada se recalcula en cada salida.
 */
export interface FilaEjecutiva {
  /** Única nota breve y contextual (null si no hay nada relevante que decir). */
  nota: string | null;
  /** «Ver contrato»: documento del contrato (propio o conjunto) cuando está incorporado. */
  contrato: { fuente: FuenteDato; conjunto: boolean; proceso: string; proceso_id: number } | null;
  /** Índice (en `ofertas`) de la oferta mostrada por defecto en el desglose. Es una decisión de presentación: no implica que haya sido seleccionada ni contratada. */
  desglose_indice: number | null;
  /** Todas las ofertas con valor, como referencias separadas (sin diferencias porcentuales). */
  comparacion: FilaComparacion[];
  nota_comparacion: string;
  /** Diferencias que sí afectan la interpretación del valor (una línea breve cada una). */
  diferencias_visibles: string[];
  /** Diferencias menores (centavos) y cocientes: solo en el detalle de cálculo. */
  diferencias_calculo: string[];
}

export interface FilaComparacion {
  indice: number;
  empresa: string;
  referencia: string | null;
  fecha: string | null;
  secuencia: 'ANTERIOR' | 'POSTERIOR' | null;
  alcance: string;
  valor: number;
  base: string;
  fuente: FuenteDato | null;
}

const BASE = { TOTAL: 'Total con AIU e IVA', COSTO_DIRECTO: 'Costo directo', SIN_BASE: 'Base no especificada' } as const;

export function valorDeOferta(o: OfertaEdificio): { valor: number; base: string; fuente: FuenteDato | null } | null {
  const c = o.componentes;
  if (c.total) return { valor: c.total, base: BASE.TOTAL, fuente: o.fuentes_componentes['total'] ?? null };
  if (c.costo_directo) return { valor: c.costo_directo, base: BASE.COSTO_DIRECTO, fuente: o.fuentes_componentes['costo_directo'] ?? null };
  const suma = Math.round(o.items.reduce((a, i) => a + (i.subtotal ?? 0), 0) * 100) / 100;
  if (suma > 0) return { valor: suma, base: BASE.SIN_BASE, fuente: o.items.find((i) => i.fuente)?.fuente ?? null };
  return null;
}

/** Recorta en el límite de una palabra (nunca a mitad de ella) y marca el corte con «…». */
const corto = (t: string, n = 96) => {
  if (t.length <= n) return t;
  const corte = t.slice(0, n - 1);
  const ultimo = corte.lastIndexOf(' ');
  return `${(ultimo > n * 0.6 ? corte.slice(0, ultimo) : corte).trimEnd().replace(/[ ,;:·-]+$/, '')}…`;
};
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function alcanceResumido(o: OfertaEdificio): string {
  const base = o.alcance ? o.alcance : o.items.length === 1 ? o.items[0].actividad : o.items.length > 1 ? `${o.items.length} actividades` : '';
  const conj = o.oferta_conjunta ? `Oferta conjunta de ${o.oferta_conjunta.edificios} edificios` : '';
  // La parte conjunta se conserva completa: se recorta la descripción de la actividad, no la advertencia.
  const sep = base && conj ? ' · ' : '';
  const margen = 96 - sep.length - conj.length;
  return (base ? corto(base, Math.max(24, margen)) : '') + sep + conj || 'Alcance no detallado en la oferta';
}

/** Palabras corrientes de razón social: no identifican a una empresa. */
const COMUNES = new Set(['empresa', 'empresas', 'demolicion', 'demoliciones', 'ingenieria', 'constructora', 'construcciones', 'colombia', 'sociedad', 'grupo', 'servicios', 'controladas', 'concretos', 'concreto', 'implosion', 'consorcio', 'union', 'temporal']);
const coincideEmpresa = (empresa: string, responsable: string | null | undefined) => {
  if (!responsable) return false;
  const limpia = (t: string) => sinTildes(t).replace(/\b(s\.?a\.?s?|ltda|sas)\b\.?/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = limpia(empresa);
  const b = limpia(responsable);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return !COMUNES.has(b) || a === b;
  const tb = new Set(b.split(' '));
  return a.split(' ').some((t) => t.length > 3 && !COMUNES.has(t) && tb.has(t));
};

/** Oferta que se muestra primero en el desglose: la de la empresa responsable cuando consta; si no, la de desglose más completo. */
export function ofertaParaDesglose(ofertas: OfertaEdificio[], responsable: string | null | undefined): number | null {
  const con = ofertas.map((o, i) => ({ o, i })).filter(({ o }) => o.items.length > 0 || valorDeOferta(o));
  if (!con.length) return null;
  const peso = (o: OfertaEdificio) => o.items.length * 10 + Object.values(o.componentes).filter((v) => v !== null).length + (o.secuencia === 'POSTERIOR' ? 0.5 : 0);
  const mejor = (xs: typeof con) => xs.slice().sort((a, b) => peso(b.o) - peso(a.o) || a.i - b.i)[0].i;
  const propias = con.filter(({ o }) => coincideEmpresa(o.empresa, responsable));
  return mejor(propias.length ? propias : con);
}

export interface EntradaEjecutiva {
  fila: Pick<FilaEdificio, 'valor' | 'area' | 'valor_m2' | 'responsable' | 'documento_contractual' | 'contrato_conjunto' | 'ofertas'>;
  contrato: { fuente: FuenteDato | null; conjunto: boolean; proceso: string; proceso_id: number } | null;
  diferencias: Array<{ texto: string; corto: string; magnitud: number }>;
}

export function construirEjecutiva(e: EntradaEjecutiva): FilaEjecutiva {
  const f = e.fila;
  const comparacion: FilaComparacion[] = [];
  f.ofertas.forEach((o, indice) => {
    const v = valorDeOferta(o);
    if (!v) return;
    comparacion.push({ indice, empresa: o.empresa, referencia: o.referencia, fecha: o.fecha, secuencia: o.secuencia, alcance: alcanceResumido(o), valor: v.valor, base: v.base, fuente: v.fuente ?? { version_id: o.version_id, documento: o.documento, pagina: null, hoja: null, celda: null } });
  });
  comparacion.sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.empresa.localeCompare(b.empresa));
  const hayVersiones = comparacion.some((c) => c.secuencia);
  const nota_comparacion = comparacion.length >= 2
    ? `Los valores son referencias separadas, cada una con su base y alcance: no se calcula una diferencia porcentual porque no consta que coincidan alcance, cantidades, impuestos y etapa.${hayVersiones ? ' «Anterior» y «posterior» indican solo el orden por fecha; no implican que la oferta haya sido aceptada.' : ''}`
    : comparacion.length === 1 ? 'Hay una sola oferta documentada; no hay otra con la cual compararla.' : 'Aún no hay ofertas documentadas para este edificio.';

  let nota: string | null = null;
  switch (f.documento_contractual) {
    case 'CONJUNTO': nota = f.contrato_conjunto ? `Contrato conjunto de ${f.contrato_conjunto.edificios} edificios (${f.contrato_conjunto.proceso}): su valor no se reparte entre ellos.` : null; break;
    case 'POR_VINCULAR': nota = 'Contrato por vincular: aún no se ha confirmado a qué proceso corresponde.'; break;
    case 'POR_INCORPORAR': nota = f.valor?.procedencia === 'CONSOLIDADO' ? 'Valor reportado en el consolidado; el contrato aún no está incorporado.' : 'El contrato aún no está incorporado.'; break;
    case 'NO_APLICA': nota = f.valor || f.area ? null : 'Aún no hay valor ni área documentados para este edificio.'; break;
    default: nota = null;
  }

  return {
    nota,
    contrato: e.contrato && e.contrato.fuente?.version_id ? { fuente: e.contrato.fuente, conjunto: e.contrato.conjunto, proceso: e.contrato.proceso, proceso_id: e.contrato.proceso_id } : null,
    desglose_indice: ofertaParaDesglose(f.ofertas, f.responsable?.nombre),
    comparacion, nota_comparacion,
    diferencias_visibles: e.diferencias.filter((d) => d.magnitud >= 1).map((d) => d.corto),
    diferencias_calculo: e.diferencias.filter((d) => d.magnitud < 1).map((d) => d.texto),
  };
}
