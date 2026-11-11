import { HojaTabla, letraColumna } from './contratacion-excel';
import { NivelPartida } from './contratacion-partidas';

/**
 * Lectura NATIVA de una cotización en Excel con la plantilla «RESUMEN» (ITEM · Descripción · UNIDAD · CANTIDAD · VR. UNITARIO · VR. PARCIAL, con SUBTOTAL,
 * A/I/U, IVA y TOTAL PROYECTO). Cada dato conserva su hoja y celda. Se leen valores almacenados, nunca fórmulas ni enlaces.
 * Reglas: un capítulo con subítems valorados es un subtotal de ellos (no una partida); el subtotal, el costo directo, el AIU, el IVA y el total se
 * informan aparte y NUNCA se suman a las partidas; la hoja de plantilla de otro proyecto («RESUMEN (2)») no se usa. No se extraen datos de contacto de personas.
 */
export interface FilaCotizacion {
  nivel: NivelPartida | 'COMPONENTE_SIN_VALOR';
  item: string | null;
  alcance: string;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  importe: number | null;
  porcentaje: number | null;
  fuente: string;
}
export interface ControlAritmetico { control: string; calculado: number; declarado: number; estado: 'CUADRA' | 'NO_CUADRA'; diferencia: number }
export interface CotizacionExcel {
  aplica: boolean;
  motivo?: string;
  hoja?: string;
  campos: Record<string, { valor: string | number; pagina: null; cita: string; fuente: string }>;
  partidas: FilaCotizacion[];
  controles_aritmeticos: ControlAritmetico[];
  hojas_descartadas: Array<{ hoja: string; motivo: string }>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();

export function leerCotizacionExcel(hojas: HojaTabla[]): CotizacionExcel {
  const vacio = (motivo: string): CotizacionExcel => ({ aplica: false, motivo, campos: {}, partidas: [], controles_aritmeticos: [], hojas_descartadas: [] });
  const descartadas: CotizacionExcel['hojas_descartadas'] = hojas.filter((h) => /^resumen\s*\(\d+\)$/i.test(h.nombre.trim())).map((h) => ({ hoja: h.nombre, motivo: 'hoja de plantilla de otro proyecto: no se usa' }));
  const hoja = hojas.find((h) => /^resumen$/i.test(h.nombre.trim()));
  if (!hoja) return { ...vacio('no hay una hoja «RESUMEN» con la plantilla de cotización'), hojas_descartadas: descartadas };
  const cel = (f: number, c: string) => {
    const col = c.charCodeAt(0) - 64;
    return hoja.filas.get(f)?.get(col)?.valor ?? null;
  };
  const filas = [...hoja.filas.keys()].sort((a, b) => a - b);
  const refer = (f: number, c: string) => `Hoja ${hoja.nombre}, celda ${c}${f}`;

  const cabecera = filas.find((f) => norm(cel(f, 'C')) === 'item' && norm(cel(f, 'D')).startsWith('descripcion') && norm(cel(f, 'H')).includes('parcial'));
  if (!cabecera) return { ...vacio('no se encontró la fila de encabezado ITEM / Descripción / VR. PARCIAL'), hoja: hoja.nombre, hojas_descartadas: descartadas };

  const campos: CotizacionExcel['campos'] = {};
  const fProyecto = filas.find((f) => norm(cel(f, 'C')).startsWith('nombre del proyecto'));
  if (fProyecto) {
    const nombre = txt(cel(fProyecto, 'D'));
    const edificio = nombre.split(/\s+localizad[oa]\b|:/i)[0].trim();
    if (edificio) campos.edificio = { valor: edificio, pagina: null, cita: nombre.slice(0, 160), fuente: refer(fProyecto, 'D') };
  }

  const out: FilaCotizacion[] = [];
  let fSub: number | null = null;
  const lineas: Array<{ f: number; item: string | null; desc: string; unidad: string | null; cant: number | null; pu: number | null; parcial: number | null }> = [];
  for (const f of filas.filter((x) => x > cabecera)) {
    if (norm(cel(f, 'G')) === 'subtotal') { fSub = f; break; }
    const item = cel(f, 'C') !== null ? txt(cel(f, 'C')) : null;
    const desc = txt(cel(f, 'D'));
    if (!item && !desc) continue;
    if (norm(desc) === 'unidad') continue; // repetición del encabezado dentro de la tabla
    lineas.push({ f, item, desc, unidad: txt(cel(f, 'E')) || null, cant: num(cel(f, 'F')), pu: num(cel(f, 'G')), parcial: num(cel(f, 'H')) });
  }
  if (fSub === null) return { ...vacio('no hay fila SUBTOTAL: la tabla no tiene la estructura esperada'), hoja: hoja.nombre, campos, hojas_descartadas: descartadas };

  const valoradas = lineas.filter((l) => l.parcial !== null && l.parcial > 0);
  for (const l of lineas) {
    const capitulo = l.item && /^\d+$/.test(l.item) ? l.item : null;
    const tieneSubValorados = !!capitulo && valoradas.some((s) => s.item && s.item.startsWith(`${capitulo}.`));
    let nivel: FilaCotizacion['nivel'];
    if (l.parcial === null || l.parcial <= 0) nivel = 'COMPONENTE_SIN_VALOR';
    else nivel = tieneSubValorados ? 'SUBTOTAL' : 'PARTIDA'; // un capítulo con subítems valorados resume a esos subítems
    out.push({ nivel, item: l.item, alcance: l.desc, unidad: l.unidad, cantidad: l.cant, precio_unitario: l.pu, importe: l.parcial, porcentaje: null, fuente: refer(l.f, 'H') });
  }

  // Cierre: subtotal, costo directo, A/I/U, IVA y total.
  const subtotal = num(cel(fSub, 'H'));
  if (subtotal !== null) out.push({ nivel: 'SUBTOTAL', item: null, alcance: 'Subtotal', unidad: null, cantidad: null, precio_unitario: null, importe: subtotal, porcentaje: null, fuente: refer(fSub, 'H') });
  let directo: number | null = null; let total: number | null = null; let impuestos = 0; let aiu = 0; let fTotal: number | null = null;
  for (const f of filas.filter((x) => x > fSub!)) {
    const rotulo = norm(cel(f, 'C'));
    const valor = num(cel(f, 'H'));
    if (rotulo === 'costos directos' && valor !== null) { directo = valor; out.push({ nivel: 'SUBTOTAL', item: null, alcance: 'Costos directos', unidad: null, cantidad: null, precio_unitario: null, importe: valor, porcentaje: null, fuente: refer(f, 'H') }); }
    else if (['a', 'i', 'u'].includes(rotulo) && valor !== null) { aiu += valor; out.push({ nivel: 'IMPUESTO_O_AIU', item: rotulo.toUpperCase(), alcance: { a: 'Administración', i: 'Imprevistos', u: 'Utilidad' }[rotulo as 'a' | 'i' | 'u'], unidad: null, cantidad: null, precio_unitario: null, importe: valor, porcentaje: num(cel(f, 'G')), fuente: refer(f, 'H') }); }
    else if (rotulo.startsWith('iva') && valor !== null) { impuestos += valor; out.push({ nivel: 'IMPUESTO_O_AIU', item: null, alcance: txt(cel(f, 'C')), unidad: null, cantidad: null, precio_unitario: null, importe: valor, porcentaje: num(cel(f, 'G')), fuente: refer(f, 'H') }); }
    else if (rotulo === 'total proyecto' && valor !== null) { total = valor; fTotal = f; out.push({ nivel: 'TOTAL', item: null, alcance: 'Total proyecto', unidad: null, cantidad: null, precio_unitario: null, importe: valor, porcentaje: null, fuente: refer(f, 'H') }); }
    else if (rotulo === 'contacto' || norm(cel(f, 'D')) === 'contacto') { const emp = txt(cel(f, 'G')).split('/')[0].trim(); if (emp) campos.proveedor = { valor: emp, pagina: null, cita: 'Contacto (solo la empresa; no se extraen nombres de personas)', fuente: refer(f, 'G') }; }
    else if (rotulo === 'nit' || norm(cel(f, 'F')) === 'nit') { const v = txt(cel(f, 'G')); if (v) campos.nit_proveedor = { valor: v, pagina: null, cita: 'NIT de la empresa', fuente: refer(f, 'G') }; }
    else if (rotulo.startsWith('no cotizacion') || norm(cel(f, 'D')).startsWith('no cotizacion')) { const v = txt(cel(f, 'G')); if (v) campos.numero_cotizacion = { valor: v, pagina: null, cita: 'No. de cotización', fuente: refer(f, 'G') }; }
    else if (norm(cel(f, 'D')).startsWith('fecha de la cotizacion')) { const v = txt(cel(f, 'G')); if (v) campos.fecha_cotizacion = { valor: v, pagina: null, cita: 'Fecha de la cotización', fuente: refer(f, 'G') }; }
    else if (norm(cel(f, 'D')).startsWith('forma de pago')) { const v = txt(cel(f, 'G')); if (v) campos.forma_pago = { valor: v.slice(0, 160), pagina: null, cita: 'Forma de pago', fuente: refer(f, 'G') }; }
  }
  if (total !== null && fTotal !== null) campos.importe = { valor: total, pagina: null, cita: 'TOTAL PROYECTO (incluye AIU e IVA)', fuente: refer(fTotal, 'H') };

  // Controles aritméticos: nunca se corrige nada; se informa si lo declarado cuadra con lo calculado.
  const controles: ControlAritmetico[] = [];
  const ctl = (control: string, calculado: number, declarado: number | null) => {
    if (declarado === null) return;
    const dif = Math.round((declarado - calculado) * 100) / 100;
    controles.push({ control, calculado: Math.round(calculado * 100) / 100, declarado, estado: Math.abs(dif) < 1 ? 'CUADRA' : 'NO_CUADRA', diferencia: dif });
  };
  ctl('Suma de partidas = subtotal', out.filter((x) => x.nivel === 'PARTIDA').reduce((a, x) => a + (x.importe ?? 0), 0), subtotal);
  ctl('Subtotal = costos directos', subtotal ?? 0, directo);
  if (directo !== null) ctl('Costos directos + AIU + IVA = total proyecto', directo + aiu + impuestos, total);
  return { aplica: true, hoja: hoja.nombre, campos, partidas: out, controles_aritmeticos: controles, hojas_descartadas: descartadas };
}

export { letraColumna };
