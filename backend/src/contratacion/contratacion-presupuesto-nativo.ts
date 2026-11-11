import type { NivelPartida } from './contratacion-partidas';

/**
 * Desglose de un presupuesto de cotización con la tabla «ÍTEM · DESCRIPCIÓN · UND · CANT. · VR. TOTAL» seguida de COSTO DIRECTO, administración,
 * imprevistos, utilidad, total antes de IVA, IVA y TOTAL PROPUESTA. Según el PDF, el texto trae las cifras junto a sus rótulos o, en otros casos,
 * todas juntas al final de la página: se asocian por ORDEN, y la asociación solo se acepta si las operaciones aritméticas del propio documento
 * cuadran (suma de componentes, IVA sobre la utilidad, total). Si algo no cuadra, o hay otro número de cifras, no se extrae nada.
 * Cada importe conserva su página y el texto de la cifra tal como consta; no se usa ningún modelo ni se relaja la exigencia de evidencia.
 */
export interface PartidaPresupuesto {
  nivel: NivelPartida;
  edificio: string | null;
  alcance: string;
  alcance_literal: boolean;
  importe: number;
  unidad: string;
  cantidad?: number;
  pagina: number;
  cita: string;
  relacion: 'EXPLICITA' | 'PENDIENTE_REVISION';
  origen: 'NATIVO_POR_ORDEN' | 'OCR_LOCAL';
  importe_en_el_texto?: number;
}
export interface ControlPresupuesto { control: string; calculado: number; declarado: number; estado: 'CUADRA' | 'NO_CUADRA'; diferencia: number }
export interface PresupuestoNativo {
  pagina: number;
  edificio: string | null;
  partidas: PartidaPresupuesto[];
  controles_aritmeticos: ControlPresupuesto[];
}
export type ResultadoPresupuesto = { ok: true; presupuesto: PresupuestoNativo } | { ok: false; motivo: string };

const MONTO = /\d{1,3}(?:\.\d{3})+,\d{2}/g;
const aNumero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const r2 = (n: number) => Math.round(n * 100) / 100;
const UND: Record<string, string> = { GL: 'GLOBAL', UND: 'UND', M2: 'M2', M3: 'M3' };

export function extraerPresupuestoNativo(paginas: Array<{ pagina: number; texto: string }>): ResultadoPresupuesto {
  const candidatas = paginas.filter((p) => /TOTAL\s+COSTO\s+DIRECTO/i.test(p.texto) && /TOTAL\s+PROPUEST\s*A/i.test(p.texto));
  if (candidatas.length === 0) return { ok: false, motivo: 'no hay una tabla de presupuesto con costo directo y total de la propuesta' };
  if (candidatas.length > 1) return { ok: false, motivo: 'más de una página con tabla de presupuesto' };
  const { pagina } = candidatas[0];
  const t = candidatas[0].texto.replace(/\s+/g, ' ');

  const pos = (re: RegExp) => { const m = re.exec(t); return m ? m.index : -1; };
  const etiquetas = [
    pos(/TOTAL COSTO DIRECTO/i), pos(/ADMINISTRACI[ÓO]N\s+\d/i), pos(/IMPREVISTOS\s+\d/i), pos(/UTILIDAD\s+\d/i),
    pos(/TOTAL ANTES DE IVA/i), pos(/IVA SOBRE UTILIDAD\s*\d/i), pos(/TOTAL PROPUEST\s*A/i),
  ];
  if (etiquetas.some((x) => x < 0) || etiquetas.some((x, i) => i > 0 && x <= etiquetas[i - 1])) return { ok: false, motivo: 'los rótulos del presupuesto no están en el orden esperado' };

  const pct = (re: RegExp) => { const m = re.exec(t); return m ? Number(m[1].replace(',', '.')) : null; };
  const pAdm = pct(/ADMINISTRACI[ÓO]N\s+(\d+(?:,\d+)?)\s*%/i);
  const pImp = pct(/IMPREVISTOS\s+(\d+(?:,\d+)?)\s*%/i);
  const pUti = pct(/UTILIDAD\s+(\d+(?:,\d+)?)\s*%/i);
  const pIva = pct(/IVA SOBRE UTILIDAD\s*(\d+(?:,\d+)?)\s*%/i);
  if ([pAdm, pImp, pUti, pIva].some((x) => x === null)) return { ok: false, motivo: 'faltan los porcentajes de administración, imprevistos, utilidad o IVA' };

  // Cifras de la página, sin las que van entre paréntesis (el valor repetido en letras y números del encabezado o del cierre).
  const montos: Array<{ texto: string; valor: number }> = [];
  for (const m of t.matchAll(MONTO)) {
    if (/\(\s*\$?\s*$/.test(t.slice(Math.max(0, m.index! - 8), m.index!))) continue;
    montos.push({ texto: m[0], valor: aNumero(m[0]) });
  }
  if (montos.length !== 8) return { ok: false, motivo: `se esperaban 8 cifras (un ítem y siete rótulos) y la página trae ${montos.length}` };
  const [item, costo, adm, imp, uti, antes, iva, total] = montos;

  const controles: ControlPresupuesto[] = [];
  const control = (nombre: string, calculado: number, declarado: number, tol: number) => {
    const dif = r2(declarado - calculado);
    controles.push({ control: nombre, calculado: r2(calculado), declarado, estado: Math.abs(dif) <= tol ? 'CUADRA' : 'NO_CUADRA', diferencia: dif });
  };
  control('Ítem = total costo directo', item.valor, costo.valor, 0.02);
  control(`Administración ${pAdm}% de costo directo`, costo.valor * pAdm! / 100, adm.valor, 1);
  control(`Imprevistos ${pImp}% de costo directo`, costo.valor * pImp! / 100, imp.valor, 1);
  control(`Utilidad ${pUti}% de costo directo`, costo.valor * pUti! / 100, uti.valor, 1);
  control('Costo directo + administración + imprevistos + utilidad = total antes de IVA', costo.valor + adm.valor + imp.valor + uti.valor, antes.valor, 0.02);
  control(`IVA ${pIva}% sobre la utilidad`, uti.valor * pIva! / 100, iva.valor, 1);
  control('Total antes de IVA + IVA = total de la propuesta', antes.valor + iva.valor, total.valor, 0.02);
  const mal = controles.find((c) => c.estado === 'NO_CUADRA');
  if (mal) return { ok: false, motivo: `la asociación por orden no pasa el control «${mal.control}»` };

  // Ítem: «DESMONTAJE Y DEMOLICIÓN MECÁNICA 1 EDIFICIO CALI EXPRESS GL 1,00».
  const fila = /VR\.? TOTAL (.+?) (\d{1,3}) (.+?) (GL|UND|M2|M3) (\d+(?:,\d+)?)(?= |$)/i.exec(t);
  const descripcion = fila ? fila[1].trim() : 'Ítem del presupuesto';
  const nombre = fila ? fila[3].split(/\s[—–-]\s/)[0].trim() : null;
  const unidad = fila ? UND[fila[4].toUpperCase()] ?? 'OTRA' : 'GLOBAL';
  const cantidad = fila ? Number(fila[5].replace(',', '.')) : undefined;
  const edificio = nombre && nombre.length >= 4 && nombre.length <= 160 ? nombre : null;

  const mk = (nivel: NivelPartida, alcance: string, m: { texto: string; valor: number }, extra: Partial<PartidaPresupuesto> = {}): PartidaPresupuesto => ({
    nivel, edificio, alcance, alcance_literal: false, importe: m.valor, unidad: 'GLOBAL', pagina, cita: `$ ${m.texto}`, relacion: edificio ? 'EXPLICITA' : 'PENDIENTE_REVISION', origen: 'NATIVO_POR_ORDEN', ...extra,
  });
  const partidas: PartidaPresupuesto[] = [
    mk('PARTIDA', `${descripcion}${edificio ? ` — ${edificio}` : ''} (costo directo)`, item, { unidad, ...(cantidad !== undefined ? { cantidad } : {}) }),
    mk('SUBTOTAL', 'Total costo directo', costo),
    mk('IMPUESTO_O_AIU', `Administración ${pAdm}% (AIU)`, adm),
    mk('IMPUESTO_O_AIU', `Imprevistos ${pImp}% (AIU)`, imp),
    mk('IMPUESTO_O_AIU', `Utilidad ${pUti}% (AIU)`, uti),
    mk('SUBTOTAL', 'Total antes de IVA', antes),
    mk('IMPUESTO_O_AIU', `IVA ${pIva}% sobre la utilidad`, iva),
    mk('TOTAL', 'Total de la oferta (total propuesta)', total),
  ];
  return { ok: true, presupuesto: { pagina, edificio, partidas, controles_aritmeticos: controles } };
}

/**
 * Incorpora el desglose nativo a un resultado ya aceptado. Sustituye solo las partidas de la página del presupuesto (las del modelo en esa página
 * quedan sustituidas por la lectura nativa, que sí consta literalmente); conserva el resto, los campos y los descartes. Si no hay desglose
 * nativo verificable, devuelve el resultado intacto y el motivo.
 */
export function fusionarPresupuestoNativo<T extends { partidas?: any[]; trazabilidad?: any; controles_aritmeticos?: any[] }>(resultado: T, paginas: Array<{ pagina: number; texto: string }>): { resultado: T; aplicado: boolean; motivo?: string } {
  const r = extraerPresupuestoNativo(paginas);
  if (r.ok === false) return { resultado, aplicado: false, motivo: r.motivo };
  const p = r.presupuesto;
  const otras = (resultado.partidas ?? []).filter((x: any) => x.pagina !== p.pagina);
  return {
    aplicado: true,
    resultado: {
      ...resultado,
      partidas: [...otras, ...p.partidas],
      controles_aritmeticos: [...(resultado.controles_aritmeticos ?? []), ...p.controles_aritmeticos],
      trazabilidad: { ...(resultado.trazabilidad ?? {}), desglose: `NATIVO_POR_ORDEN (p. ${p.pagina}; asociación aceptada porque los ${p.controles_aritmeticos.length} controles aritméticos cuadran)` },
    },
  };
}

// ------------------------------------------------------------------ cierre de la oferta leído por OCR local
/** Importe del final de una línea de OCR, tolerante a separadores mal leídos («1,955.719,270,44»): los dos últimos dígitos son centavos si los precede un separador. */
export function montoDeLinea(s: string): number | null {
  const m = /([\d][\d.,\s]*\d)\s*$/.exec(s.trim());
  if (!m) return null;
  const digitos = m[1].replace(/\D/g, '');
  if (digitos.length < 4) return null;
  return /[.,]\d{2}$/.test(m[1]) ? Number(digitos) / 100 : Number(digitos);
}

export type ResultadoCierre = { ok: true; partidas: PartidaPresupuesto[]; controles: ControlPresupuesto[] } | { ok: false; motivo: string };

/**
 * Bloque de cierre de una oferta cuya tabla es una imagen (administración, utilidad, total antes de IVA, IVA y total), leído por OCR local de esa
 * página. Solo se acepta si las operaciones aritméticas entre las propias líneas cuadran (el OCR confunde separadores y dígitos; una cifra que no
 * cuadra no se acepta). No recupera los ítems por edificio ni las filas que el OCR no lee.
 */
export function extraerCierreOcr(texto: string, pagina: number): ResultadoCierre {
  // El OCR deja marcas de tabla («[», «|») pegadas a las líneas: se descartan en los extremos.
  const lineas = texto.split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/^[\s[\]|]+|[\s[\]|]+$/g, '').trim()).filter(Boolean);
  const buscar = (re: RegExp) => lineas.map((l) => re.exec(l)).find((m) => m) ?? null;
  const pct = (m: RegExpExecArray | null) => (m ? Number(m[1].replace(',', '.')) : null);
  const mAdm = buscar(/^ADMINISTRACI[ÓO]N:?\s*(\d+(?:,\d+)?)\s*%\s*(.+)$/i);
  const mImp = buscar(/^IMPREVISTOS:?\s*(\d+(?:,\d+)?)\s*%\s*(.+)$/i);
  const mUti = buscar(/^UTILIDAD:?\s*(\d+(?:,\d+)?)\s*%\s*(.+)$/i);
  const mAntes = buscar(/^TOTAL ANTES DE IVA\.?\s*(.+)$/i);
  const mIva = buscar(/^IVA SOBRE UTILIDAD\s*(\d+(?:,\d+)?)\s*%\s*(.+)$/i);
  const mTot = buscar(/^TOTAL\s+(\d[\d.,\s]*)$/i);
  if (!mAdm || !mUti || !mAntes || !mIva || !mTot) return { ok: false, motivo: 'el OCR no lee todas las líneas del cierre (administración, utilidad, total antes de IVA, IVA y total)' };
  const imp = mImp ? montoDeLinea(mImp[2]) : null; const pImp = mImp ? pct(mImp) : null;
  const adm = montoDeLinea(mAdm[2]); const uti = montoDeLinea(mUti[2]); const antes = montoDeLinea(mAntes[1]); const iva = montoDeLinea(mIva[2]); const total = montoDeLinea(mTot[1]);
  const pA = pct(mAdm); const pU = pct(mUti); const pI = pct(mIva);
  if ([adm, uti, antes, iva, total, pA, pU, pI].some((x) => x === null)) return { ok: false, motivo: 'alguna cifra del cierre no es legible' };
  const controles: ControlPresupuesto[] = [];
  const control = (nombre: string, calculado: number, declarado: number, tol: number) => {
    const dif = r2(declarado - calculado);
    controles.push({ control: nombre, calculado: r2(calculado), declarado, estado: Math.abs(dif) <= tol ? 'CUADRA' : 'NO_CUADRA', diferencia: dif });
  };
  control(`IVA ${pI}% sobre la utilidad`, uti! * pI! / 100, iva!, 1);
  // El porcentaje impreso lleva dos decimales (p. ej. 21,16 %): la tolerancia es el redondeo de ese porcentaje.
  control(`Administración ${pA}% = utilidad ${pU}% × ${pA}/${pU}`, uti! * pA! / pU!, adm!, 1 + adm! * (0.005 / pA!));
  if (imp !== null && pImp !== null) {
    control(`Imprevistos ${pImp}% = utilidad ${pU}% × ${pImp}/${pU}`, uti! * pImp / pU!, imp, 1);
    // Costo directo implícito (utilidad ÷ porcentaje) + administración + imprevistos + utilidad = total antes de IVA.
    control('Costo directo implícito (utilidad ÷ %) + administración + imprevistos + utilidad = total antes de IVA', uti! / (pU! / 100) + adm! + imp + uti!, antes!, 0.5);
  }
  control('Total antes de IVA + IVA = total de la oferta', antes! + iva!, total!, 0.02);
  const mal = controles.find((c) => c.estado === 'NO_CUADRA');
  if (mal) return { ok: false, motivo: `el cierre leído por OCR no pasa el control «${mal.control}»` };
  const mk = (nivel: NivelPartida, alcance: string, importe: number, cita: string): PartidaPresupuesto => ({
    nivel, edificio: null, alcance, alcance_literal: false, importe, unidad: 'GLOBAL', pagina, cita: cita.slice(0, 120), relacion: 'PENDIENTE_REVISION', origen: 'OCR_LOCAL',
  });
  return {
    ok: true, controles,
    partidas: [
      mk('IMPUESTO_O_AIU', `Administración ${pA}% (AIU) — cierre de la oferta`, adm!, mAdm[0]),
      ...(imp !== null ? [mk('IMPUESTO_O_AIU', `Imprevistos ${pImp}% (AIU) — cierre de la oferta`, imp, mImp![0])] : []),
      mk('IMPUESTO_O_AIU', `Utilidad ${pU}% (AIU) — cierre de la oferta`, uti!, mUti[0]),
      mk('SUBTOTAL', 'Total antes de IVA — cierre de la oferta', antes!, mAntes[0]),
      mk('IMPUESTO_O_AIU', `IVA ${pI}% sobre la utilidad — cierre de la oferta`, iva!, mIva[0]),
      mk('TOTAL', 'Total de la oferta (con centavos, leído del cierre)', total!, mTot[0]),
    ],
  };
}

/**
 * Incorpora el cierre leído por OCR. Si el resultado ya traía un total de esa página que el texto expresa sin centavos (p. ej. «$ 9.402.324.207»),
 * ese total pasa a llevar los centavos documentados y se conserva el importe del texto; si no, se añade. Deja constancia de que el desglose por
 * ítem sigue pendiente: esto NO completa el desglose.
 */
export function fusionarCierreOcr<T extends { partidas?: any[]; trazabilidad?: any; controles_aritmeticos?: any[]; no_encontrados?: any[] }>(resultado: T, cierre: Extract<ResultadoCierre, { ok: true }>, pagina: number): T {
  const partidas = [...(resultado.partidas ?? [])];
  const nuevo = cierre.partidas.find((p) => p.nivel === 'TOTAL')!;
  const i = partidas.findIndex((p) => p.pagina === pagina && p.nivel === 'TOTAL' && Math.abs(p.importe - nuevo.importe) < 1);
  const resto = cierre.partidas.filter((p) => p !== nuevo || i < 0).filter((p) => !partidas.some((q) => q.pagina === pagina && q.origen === 'OCR_LOCAL' && q.alcance === p.alcance));
  if (i >= 0) partidas[i] = { ...partidas[i], importe: nuevo.importe, importe_en_el_texto: partidas[i].importe_en_el_texto ?? partidas[i].importe, origen: 'OCR_LOCAL', cita: String(partidas[i].cita).includes('centavos según OCR') ? partidas[i].cita : `${partidas[i].cita} · centavos según OCR local p. ${pagina}: ${nuevo.cita}`.slice(0, 240) };
  const motivo = 'los ítems por edificio de la tabla (imagen) no se leen con el OCR local; el desglose por ítem sigue pendiente (valores verificados en imagen: ver cotizaciones del edificio)';
  const no = (resultado.no_encontrados ?? []).filter((n: any) => n.campo !== 'desglose');
  return {
    ...resultado,
    partidas: [...partidas, ...resto],
    controles_aritmeticos: [...(resultado.controles_aritmeticos ?? []).filter((c: any) => !cierre.controles.some((x) => x.control === c.control)), ...cierre.controles],
    no_encontrados: [...no, { campo: 'desglose', motivo }],
    trazabilidad: { ...(resultado.trazabilidad ?? {}), cierre: `OCR_LOCAL (p. ${pagina}; ${cierre.controles.length} controles aritméticos cuadran)` },
  };
}
