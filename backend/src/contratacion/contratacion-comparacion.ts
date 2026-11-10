/**
 * Lógica pura (sin BD) de la vista "Comparación de cotizaciones": significado de cada valor,
 * diferencias de alcance entre ofertas y requisito de resolución de demolición.
 * No emite veredictos: solo ordena lo documentado y señala lo que falta o no coincide.
 */

export type TipoValorSignificado =
  | 'PRESUPUESTO_OFICIAL'
  | 'COTIZACION'
  | 'OFERTA_SELECCIONADA'
  | 'VALOR_CONTRATADO'
  | 'VALOR_EJECUTADO';

export const ETIQUETA_VALOR: Record<TipoValorSignificado, string> = {
  PRESUPUESTO_OFICIAL: 'Presupuesto oficial',
  COTIZACION: 'Cotización',
  OFERTA_SELECCIONADA: 'Oferta seleccionada',
  VALOR_CONTRATADO: 'Valor contratado',
  VALOR_EJECUTADO: 'Valor ejecutado',
};

export interface SoporteRef { documento_id: number | null; version_id: number | null; documento: string | null; pagina: number | null; hoja: string | null; celda: string | null }
export interface ValorSignificado {
  tipo: TipoValorSignificado;
  etiqueta: string;
  /** SOPORTADO: tiene fuente y acto. CITADO_SIN_ACTA: se cita pero falta el acta. PENDIENTE_SOPORTE: no hay documento. */
  estado: 'SOPORTADO' | 'CITADO_SIN_ACTA' | 'PENDIENTE_SOPORTE';
  importes: Array<{ importe: number; concepto: string | null; proveedor: string | null; soporte: SoporteRef | null; estado_soporte: string }>;
}

interface EntradaValores {
  valores: Array<{ tipo: string; importe: number; concepto: string | null; estado_soporte: string; oferta: string | null; soporte: SoporteRef | null }>;
  contratos: Array<{ valor: number; tipo_acto: string; oferta: string | null; soporte: SoporteRef | null; alcance?: string | null; numero?: string | null; contratista?: string | null; expresion_valor?: string | null }>;
  /** Oferta marcada como seleccionada por una justificación documentada (sin acto de contratación). */
  seleccionJustificada: Array<{ oferta: string | null; texto: string; soporte: SoporteRef | null }>;
}

/**
 * Cinco significados siempre visibles. Aunque coincidan en monto, cada uno conserva su fuente.
 * Lo que no tiene documento queda como "Pendiente de soporte".
 */
export function valoresPorSignificado(e: EntradaValores): ValorSignificado[] {
  const de = (tipo: string) => e.valores.filter((v) => v.tipo === tipo);
  const filas = (xs: typeof e.valores) => xs.map((v) => ({ importe: v.importe, concepto: v.concepto, proveedor: v.oferta, soporte: v.soporte, estado_soporte: v.estado_soporte }));
  const estadoDe = (xs: Array<{ estado_soporte: string }>): ValorSignificado['estado'] =>
    xs.length === 0 ? 'PENDIENTE_SOPORTE' : xs.every((x) => x.estado_soporte === 'CITADO_SIN_ACTA') ? 'CITADO_SIN_ACTA' : 'SOPORTADO';
  const mk = (tipo: TipoValorSignificado, importes: ValorSignificado['importes']): ValorSignificado => ({ tipo, etiqueta: ETIQUETA_VALOR[tipo], estado: estadoDe(importes), importes });

  // La oferta seleccionada solo se afirma con un acto de contratación o con una justificación documentada.
  const seleccionadas: ValorSignificado['importes'] = [];
  const proveedoresSel = new Set<string>();
  for (const c of e.contratos) if (c.oferta) proveedoresSel.add(c.oferta);
  for (const s of e.seleccionJustificada) if (s.oferta) proveedoresSel.add(s.oferta);
  for (const v of de('COTIZADO')) if (v.oferta && proveedoresSel.has(v.oferta)) seleccionadas.push({ importe: v.importe, concepto: v.concepto, proveedor: v.oferta, soporte: v.soporte, estado_soporte: v.estado_soporte });

  return [
    mk('PRESUPUESTO_OFICIAL', filas(de('PRESUPUESTO_OFICIAL'))),
    mk('COTIZACION', filas(de('COTIZADO'))),
    mk('OFERTA_SELECCIONADA', seleccionadas),
    mk('VALOR_CONTRATADO', e.contratos.map((c) => ({ importe: c.valor, concepto: c.numero ? `${c.tipo_acto === 'CONTRATO' ? 'Contrato' : c.tipo_acto} ${c.numero}${c.expresion_valor ? ' · ' + c.expresion_valor : ''}` : c.alcance ?? c.tipo_acto, proveedor: c.oferta ?? c.contratista ?? null, soporte: c.soporte, estado_soporte: 'RESPALDADO' }))),
    mk('VALOR_EJECUTADO', filas(de('EJECUTADO'))),
  ];
}

const CONCEPTOS_ALCANCE: Array<{ clave: string; nombre: string; re: RegExp }> = [
  { clave: 'MAQUINARIA_ESPECIAL', nombre: 'Maquinaria o equipo especial', re: /maquinaria\s+especial|equipo\s+(?:de\s+)?largo\s+alcance|martillo\s+hidr|izaje|trabajo\s+en\s+alturas|implosi/i },
  { clave: 'TRANSPORTE', nombre: 'Transporte de materiales', re: /transporte|volqueta|\bviaje/i },
  { clave: 'CERRAMIENTO', nombre: 'Cerramiento o aislamiento', re: /cerramiento|aislamiento|cinta\s+de\s+seguridad/i },
  { clave: 'PLAN_MANEJO', nombre: 'Planes de manejo (PMA / seguridad)', re: /plan(?:es)?\s+de\s+manejo|\bPMA\b/i },
  { clave: 'GESTION_RCD', nombre: 'Gestión o disposición final de RCD', re: /gesti[oó]n\s+(?:integral\s+)?de\s+rcd|disposici[oó]n\s+final|escombrera|gestor(?:es)?\s+autorizad/i },
];

export interface OfertaParaAlcance {
  clave: string;
  proveedor: string;
  incluye: string[];
  excluye: string[];
  lineas: Array<{ actividad: string; descripcion: string }>;
}

export interface DiferenciaAlcance {
  concepto: string;
  incluyen: string[];
  no_incluyen: string[];
}

/**
 * Conceptos que cambian el alcance y que no están en todas las ofertas. Solo con una sola oferta
 * no hay diferencias que calcular: se indica que no hay con qué contrastar.
 */
export function diferenciasAlcance(ofertas: OfertaParaAlcance[]): { hay_diferencias: boolean; comparables: boolean; diferencias: DiferenciaAlcance[]; aviso: string | null } {
  if (ofertas.length < 2) {
    return { hay_diferencias: false, comparables: false, diferencias: [], aviso: ofertas.length === 1 ? 'Solo hay una oferta documentada: no hay otra con la cual contrastar el alcance.' : 'No hay ofertas documentadas.' };
  }
  const textoDe = (o: OfertaParaAlcance) => [...o.incluye, ...o.lineas.map((l) => `${l.actividad} ${l.descripcion}`)].join(' | ');
  const diferencias: DiferenciaAlcance[] = [];
  for (const c of CONCEPTOS_ALCANCE) {
    const incluyen = ofertas.filter((o) => c.re.test(textoDe(o))).map((o) => o.proveedor);
    if (incluyen.length > 0 && incluyen.length < ofertas.length) {
      diferencias.push({ concepto: c.nombre, incluyen, no_incluyen: ofertas.filter((o) => !incluyen.includes(o.proveedor)).map((o) => o.proveedor) });
    }
  }
  return {
    hay_diferencias: diferencias.length > 0,
    comparables: true,
    diferencias,
    aviso: diferencias.length ? 'Las ofertas no cubren el mismo alcance: revise estas diferencias antes de interpretar cualquier porcentaje.' : null,
  };
}

export type RequisitoResolucion = 'VERIFICADA' | 'PENDIENTE_SOPORTE' | 'NO_APLICA' | 'POR_CONFIRMAR_ALCANCE' | 'SIN_INTERVENCION';

export interface ProcesoParaResolucion {
  alcance_confirmado: string | null;
  /** Actividades documentadas del proceso (hechos/líneas). */
  actividades: string[];
}

const RE_DEMOLICION = /demolici|derribo|implosi/i;

/**
 * Regla por edificio:
 * - Resolución verificada registrada => VERIFICADA.
 * - Alcance confirmado "RCD sin demolición" en todos sus procesos => NO_APLICA.
 * - Intervención de demolición (confirmada o documentada) sin resolución => PENDIENTE_SOPORTE.
 * - Una cotización no autoriza una demolición: sin resolución nunca queda verificada.
 */
export function requisitoResolucion(procesos: ProcesoParaResolucion[], resolucionesVerificadas: number, resolucionesCitadas: number): RequisitoResolucion {
  if (resolucionesVerificadas > 0) return 'VERIFICADA';
  if (procesos.length === 0) return resolucionesCitadas > 0 ? 'PENDIENTE_SOPORTE' : 'SIN_INTERVENCION';
  const demuele = (p: ProcesoParaResolucion) => p.alcance_confirmado === 'DEMOLICION' || (p.alcance_confirmado !== 'RCD_SIN_DEMOLICION' && p.actividades.some((a) => RE_DEMOLICION.test(a)));
  if (procesos.some(demuele)) return 'PENDIENTE_SOPORTE';
  if (procesos.every((p) => p.alcance_confirmado === 'RCD_SIN_DEMOLICION')) return 'NO_APLICA';
  return 'POR_CONFIRMAR_ALCANCE';
}

export const ETIQUETA_REQUISITO: Record<RequisitoResolucion, string> = {
  VERIFICADA: 'Resolución verificada',
  PENDIENTE_SOPORTE: 'Resolución pendiente de soporte',
  NO_APLICA: 'No aplica (retiro o transporte de RCD sin demolición)',
  POR_CONFIRMAR_ALCANCE: 'Alcance por confirmar: aún no se sabe si requiere resolución',
  SIN_INTERVENCION: 'Sin intervención contractual confirmada',
};

export interface DiferenciaSinExplicar { codigo: string; descripcion: string }

/** Diferencias entre valores que los documentos todavía no explican. Nunca concluye "sin sobrecostos". */
export function diferenciasSinExplicar(significados: ValorSignificado[], pendientesAclaracion: string[]): DiferenciaSinExplicar[] {
  const out: DiferenciaSinExplicar[] = [];
  const total = (t: TipoValorSignificado) => significados.find((s) => s.tipo === t)!.importes;
  const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const oficial = total('PRESUPUESTO_OFICIAL');
  const cot = total('COTIZACION');
  const contratado = total('VALOR_CONTRATADO');
  const ejec = total('VALOR_EJECUTADO');
  const distinto = (a: number, b: number) => Math.abs(a - b) > 0.5;
  const suma = (xs: Array<{ importe: number }>) => xs.reduce((s, x) => s + x.importe, 0);
  if (oficial.length && cot.length) {
    const mx = Math.max(...cot.map((c) => c.importe));
    if (distinto(mx, suma(oficial))) out.push({ codigo: 'COTIZACION_VS_OFICIAL', descripcion: `La cotización más alta ($${fmt(mx)}) no coincide con el presupuesto oficial ($${fmt(suma(oficial))}); los documentos aún no explican la diferencia.` });
  }
  if (contratado.length && ejec.length && distinto(suma(contratado), suma(ejec))) {
    out.push({ codigo: 'EJECUTADO_VS_CONTRATADO', descripcion: `El valor ejecutado ($${fmt(suma(ejec))}) difiere del contratado ($${fmt(suma(contratado))}); falta documentar el motivo.` });
  }
  if (ejec.length > 1 && new Set(ejec.map((x) => Math.round(x.importe))).size > 1) {
    out.push({ codigo: 'EJECUTADO_MULTIPLES', descripcion: 'Hay más de un valor ejecutado citado con importes distintos; cada uno conserva su fuente y ninguno se ha conciliado.' });
  }
  if (!contratado.length && ejec.length) out.push({ codigo: 'EJECUTADO_SIN_CONTRATO', descripcion: 'Hay un valor ejecutado citado sin contrato ni acta que lo respalde.' });
  for (const p of pendientesAclaracion) {
    // Una aclaración escrita antes de que el contrato constara («sin contrato, acta ni soporte de pago…») se reformula con lo que aún falta.
    const anteriorAlContrato = contratado.length > 0 && /^sin contrato,? acta ni soporte de pago/i.test(p.trim());
    out.push({ codigo: 'PENDIENTE_ACLARACION', descripcion: anteriorAlContrato ? 'Sin acta ni soporte de pago que acredite lo ejecutado (el contrato ya consta en su documento).' : p });
  }
  return out;
}
