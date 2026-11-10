import { normalizar } from './contratacion-sugerencias';

/**
 * Lectura de contratos en PDF con texto: encabezado (número, contratista, objeto, valor) y cláusula de valor.
 * Nunca usa OCR (eso es para páginas escaneadas), no toma disponibilidades presupuestales ni cotizaciones como valor
 * del contrato y no decide por el nombre del archivo.
 */
export interface FirmaContrato {
  estado: 'FIRMADO_ELECTRONICAMENTE' | 'FIRMA_PARCIAL' | 'SIN_EVIDENCIA_DE_FIRMA';
  detalle: string;
  fecha: string | null;
  pagina: number | null;
}

export interface ContratoExtraido {
  numero_contrato: string;
  consecutivo: string;
  anio: number;
  contratista: string;
  objeto: string;
  valor: number;
  /** Expresión con la que el documento nombra el importe del encabezado (p. ej. «valor estimado del contrato»). */
  expresion_valor: string;
  pagina_valor: number;
  valor_clausula: number | null;
  pagina_clausula: number | null;
  /** Número de proceso citado dentro del contrato (distinto del número de contrato), si lo hay. */
  proceso_citado: string | null;
  firma: FirmaContrato;
  advertencias: string[];
}

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
/** El texto del PDF viene con espacios dentro de las palabras («CONTRA TO», «OBJET O»): se pegan para localizar etiquetas. */
const compacto = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export function parsearImporte(txt: string): number | null {
  const m = /\$\s*([\d][\d.\s]*(?:,\d{1,2})?)/.exec(txt);
  if (!m) return null;
  let t = m[1].replace(/\s+/g, '');
  t = t.replace(/\.+$/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Busca una etiqueta tolerando espacios dentro de sus letras y devuelve el texto que la sigue. */
function despuesDe(texto: string, etiqueta: string): { indice: number; resto: string } | null {
  const patron = new RegExp(etiqueta.split('').map((c) => (c === ' ' ? '\\s*' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*')).join(''), 'i');
  const m = patron.exec(texto);
  return m ? { indice: m.index, resto: texto.slice(m.index + m[0].length) } : null;
}

const MESES: Record<string, string> = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };

export function detectarFirma(paginas: string[]): FirmaContrato {
  const marcas: { pagina: number }[] = [];
  paginas.forEach((t, i) => {
    for (const _ of limpiar(t).matchAll(/firmado\s+electr[oó]nicamente/gi)) marcas.push({ pagina: i + 1 });
  });
  const ultima = marcas.length ? marcas[marcas.length - 1].pagina : null;
  let fecha: string | null = null;
  for (const t of paginas.slice(-3)) {
    const m = /\(\s*([\d\s]{1,5})\)\s*d[ií]as\s+del\s+mes(?:\s+de)?\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(limpiar(t));
    if (m) {
      const mes = MESES[m[2].toLowerCase()];
      const dia = m[1].replace(/\s/g, '').padStart(2, '0');
      if (mes) fecha = `${m[3]}-${mes}-${dia}`;
    }
  }
  if (marcas.length >= 2) {
    return {
      estado: 'FIRMADO_ELECTRONICAMENTE',
      detalle: `Marcas «firmado electrónicamente» de ambas partes (pág. ${ultima}).${fecha ? '' : ' No consta la fecha de suscripción ni la constancia de la plataforma SECOP II en el PDF.'}`,
      fecha, pagina: ultima,
    };
  }
  if (marcas.length === 1) {
    return { estado: 'FIRMA_PARCIAL', detalle: `Solo una marca «firmado electrónicamente» (pág. ${ultima}): falta la firma de la otra parte.`, fecha, pagina: ultima };
  }
  return { estado: 'SIN_EVIDENCIA_DE_FIRMA', detalle: 'Faltan las marcas de firma electrónica de ambas partes o la constancia de suscripción en SECOP II.', fecha, pagina: null };
}

/** Devuelve null si la página 1 no es el encabezado de un contrato. */
export function extraerContrato(paginas: string[]): ContratoExtraido | null {
  if (paginas.length === 0) return null;
  const p1 = limpiar(paginas[0]);
  if (!/CONTRA\s*TO\s+No/i.test(p1)) return null;

  const num = /CONTRA\s*TO\s+No\s*\.?\s*([\d][\d.\s]*?)\s*-\s*(\d{4})/i.exec(p1);
  if (!num) return null;
  const grupos = num[1].replace(/\s+/g, '').replace(/\.+$/, '');
  const consecutivo = grupos.split('.').pop() ?? '';
  const anio = Number(num[2]);
  const numero_contrato = `${grupos}-${num[2]}`;

  const iC = despuesDe(p1, 'CONTRATISTA:');
  const iO = despuesDe(p1, 'OBJETO:');
  const iV = despuesDe(p1, 'VALOR:');
  if (!iC || !iO || !iV) return null;
  const contratista = limpiar(iC.resto.slice(0, Math.max(0, iO.indice - (p1.length - iC.resto.length)))).replace(/^[:\s]+/, '');
  const objeto = limpiar(iO.resto.slice(0, Math.max(0, iV.indice - (p1.length - iO.resto.length)))).replace(/^["“\s]+|["”\s.]+$/g, '');
  // El importe del contrato es el primero con «$» después de «VALOR:» (no CDP, cotizaciones ni pagos, que están en otras cláusulas).
  const trasValor = iV.resto.slice(0, 600);
  const valor = parsearImporte(trasValor);
  if (valor === null) return null;
  const expr = /valor\s+(?:total\s+|estimado\s+)?del\s+contrato/i.exec(trasValor.slice(0, trasValor.indexOf('$') > 0 ? trasValor.indexOf('$') : 120));
  const expresion_valor = expr ? limpiar(expr[0]).toLowerCase() : 'valor del contrato';

  // Cláusula de valor (CLÁUSULA …: VALOR): se contrasta con el encabezado.
  let valor_clausula: number | null = null;
  let pagina_clausula: number | null = null;
  for (let i = 0; i < paginas.length; i++) {
    const t = limpiar(paginas[i]);
    const m = /CL[ÁA]USULA\s+\w+\s*:?\s*VALOR\.?\s*(.{0,420})/i.exec(t);
    if (m) {
      const v = parsearImporte(m[1]);
      if (v !== null) { valor_clausula = v; pagina_clausula = i + 1; break; }
    }
  }

  const todo = paginas.map(limpiar).join(' ');
  const pc = /4163\.\s?001\.\s?32\.\s?1\.\s?(\d{1,5})\s?-\s?(\d{4})/.exec(todo);
  const proceso_citado = pc ? `4163.001.32.1.${pc[1]}-${pc[2]}` : null;

  const advertencias: string[] = [];
  if (valor_clausula !== null && Math.abs(valor_clausula - valor) > 0.5) advertencias.push(`El valor del encabezado (${valor}) no coincide con el de la cláusula de valor (${valor_clausula}).`);
  if (valor_clausula === null) advertencias.push('No se encontró la cláusula de valor para contrastar el encabezado.');

  return {
    numero_contrato, consecutivo, anio, contratista, objeto, valor, expresion_valor, pagina_valor: 1, valor_clausula, pagina_clausula,
    proceso_citado, firma: detectarFirma(paginas), advertencias,
  };
}

// ---------------------------------------------------------------------------------------------------------------------

export interface ExpedienteCandidato {
  id: number;
  proceso: string;
  numero_contrato: string | null;
  intervencion: string;
  objeto: string | null;
  proveedores: string[];
}

export interface PuntajeCandidato { id: number; puntaje: number; razones: string[] }

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'con', 'por', 'a', 'al', 'sas', 's', 'sa', 'ltda', 'servicio', 'servicios', 'contratar', 'ejecutar', 'actividades', 'sismo', 'agosto', 'marco', 'urgencia', 'manifiesta', 'calamidad', 'publica', 'distrito', 'especial', 'santiago', 'cali', 'declaradas', 'decretadas', 'situaciones', 'que', 'su', 'o']);
// Solo palabras (sin números, siglas con puntos como «S.A.S.» ni documentos de identidad).
const tokens = (s: string) => normalizar(s).replace(/[^a-zñ ]+/g, ' ').split(' ').filter((t) => t.length > 3 && !VACIAS.has(t));

/**
 * Corrobora la relación contrato ↔ expediente con cuatro evidencias independientes. El nombre del archivo no cuenta.
 *  - número de proceso citado dentro del contrato (5), número de contrato ya registrado (5), consecutivo y año (3),
 *  - contratista entre los proveedores del expediente (2) y objeto (1 por cada 3 términos significativos compartidos, máx. 2).
 */
export function puntuar(c: ContratoExtraido, expedientes: ExpedienteCandidato[]): PuntajeCandidato[] {
  const tc = new Set(tokens(c.contratista));
  const to = new Set(tokens(c.objeto));
  return expedientes.map((e) => {
    let p = 0;
    const razones: string[] = [];
    if (c.proceso_citado && e.proceso === c.proceso_citado) { p += 5; razones.push('el contrato cita este número de proceso'); }
    if (e.numero_contrato && e.numero_contrato === c.numero_contrato) { p += 5; razones.push('número de contrato ya registrado en el expediente'); }
    if (new RegExp(`\\.${c.consecutivo}-${c.anio}$`).test(e.proceso)) { p += 3; razones.push(`mismo consecutivo ${c.consecutivo} y año ${c.anio}`); }
    if (e.proveedores.some((pv) => tokens(pv).some((t) => tc.has(t)))) { p += 2; razones.push('el contratista es proveedor del expediente'); }
    const te = new Set(tokens(`${e.intervencion} ${e.objeto ?? ''}`));
    const comunes = [...to].filter((t) => te.has(t)).length;
    const pOb = Math.min(2, Math.floor(comunes / 3));
    if (pOb) { p += pOb; razones.push(`el objeto comparte ${comunes} términos`); }
    return { id: e.id, puntaje: p, razones };
  }).sort((a, b) => b.puntaje - a.puntaje);
}

export type DecisionAsociacion =
  | { tipo: 'ASOCIAR'; expedienteId: number; razones: string[] }
  | { tipo: 'REVISION'; motivo: string; candidatos: PuntajeCandidato[] }
  | { tipo: 'NUEVA_FICHA'; motivo: string };

/** Asocia solo con evidencia suficiente y sin ambigüedad; sin ningún indicio propone una ficha por número de contrato. */
export function decidir(puntajes: PuntajeCandidato[]): DecisionAsociacion {
  const [a, b] = puntajes;
  if (!a || a.puntaje === 0) return { tipo: 'NUEVA_FICHA', motivo: 'Ningún expediente comparte consecutivo, contratista ni objeto con este contrato.' };
  const tieneConsecutivoOCita = a.razones.some((r) => /consecutivo|cita este número|ya registrado/.test(r));
  const tieneOtra = a.razones.some((r) => /contratista|objeto/.test(r));
  if (a.puntaje >= 5 && tieneConsecutivoOCita && tieneOtra && (!b || b.puntaje <= a.puntaje - 3)) return { tipo: 'ASOCIAR', expedienteId: a.id, razones: a.razones };
  const cand = puntajes.filter((x) => x.puntaje > 0).slice(0, 3);
  return { tipo: 'REVISION', motivo: b && b.puntaje > a.puntaje - 3 && b.puntaje > 0 ? 'Coincidencia ambigua entre varios expedientes.' : 'Evidencia insuficiente: falta corroborar contratista u objeto.', candidatos: cand };
}
