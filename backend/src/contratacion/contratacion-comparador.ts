export interface LineaComparable {
  actividad: string;
  unidad: string;
  base_economica: string;
  grupo_comparacion?: string | null;
  precio_unitario: number | null;
}

export interface ResultadoComparacion {
  comparable: boolean;
  motivo?: string;
  diferencia_pct?: number;
}

const ETQ_UNIDAD: Record<string, string> = { M3: 'm³', M2: 'm²', H_EQUIPO: 'hora de equipo', VIAJE: 'viaje', GLOBAL: 'suma global', UND: 'unidad' };
const ETQ_BASE: Record<string, string> = { COSTO_DIRECTO: 'costo directo', AIU: 'AIU', IMPUESTOS: 'impuestos', TOTAL: 'total según la fuente' };
const u = (x: string) => ETQ_UNIDAD[x] ?? x;
const b = (x: string) => ETQ_BASE[x] ?? x;

/**
 * Diferencia porcentual de `a` frente a la referencia `ref`, solo si actividad, unidad,
 * tratamiento económico y alcance son comparables y la referencia es > 0.
 */
export function compararLineas(a: LineaComparable, ref: LineaComparable): ResultadoComparacion {
  if (a.precio_unitario == null || ref.precio_unitario == null) {
    return { comparable: false, motivo: 'Falta el precio unitario en una de las líneas.' };
  }
  if (a.unidad === 'GLOBAL' || ref.unidad === 'GLOBAL') {
    return { comparable: false, motivo: 'Un valor global (suma global) no se compara con un precio unitario.' };
  }
  if (a.unidad !== ref.unidad) {
    const extra =
      (a.unidad === 'M2' && ref.unidad === 'M3') || (a.unidad === 'M3' && ref.unidad === 'M2')
        ? ' Un área no equivale a un volumen de RCD.'
        : '';
    return { comparable: false, motivo: `Unidades distintas (${u(a.unidad)} frente a ${u(ref.unidad)}).${extra}` };
  }
  if (a.actividad !== ref.actividad) {
    return {
      comparable: false,
      motivo: `Actividades distintas (${a.actividad} frente a ${ref.actividad}): no se compara una actividad individual con otra ni con el servicio integral.`,
    };
  }
  if (a.base_economica !== ref.base_economica) {
    return { comparable: false, motivo: `Tratamiento económico distinto (${b(a.base_economica)} frente a ${b(ref.base_economica)}).` };
  }
  if (!a.grupo_comparacion || a.grupo_comparacion !== ref.grupo_comparacion) {
    return { comparable: false, motivo: 'El alcance no está verificado como equivalente en ambas fuentes.' };
  }
  if (!(ref.precio_unitario > 0)) {
    return { comparable: false, motivo: 'La referencia no es mayor que cero.' };
  }
  const pct = ((a.precio_unitario - ref.precio_unitario) / ref.precio_unitario) * 100;
  return { comparable: true, diferencia_pct: Math.round(pct * 100) / 100 };
}

/** Una referencia de mercado de valor global nunca se compara con precios unitarios. */
export function compararConReferenciaGlobal(): ResultadoComparacion {
  return {
    comparable: false,
    motivo: 'Valor global de un contrato de referencia: no es un precio unitario ni comparte alcance ni cantidades.',
  };
}
