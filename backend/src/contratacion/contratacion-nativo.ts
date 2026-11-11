import { extraerAreasNativas } from './contratacion-areas';

/**
 * Extracción NATIVA (sin OCR ni API) de datos pertinentes de un PDF con texto: tipo de intervención, dirección, número de resolución, código de
 * evaluación ATC-20 y matrícula inmobiliaria del predio. Que un documento ya tenga edificio vinculado resuelve su CLASIFICACIÓN, pero no demuestra que se
 * hayan extraído sus datos: este módulo deja constancia de lo hallado (con página y cita) y de lo que el extractor NO encontró.
 * Un dato ambiguo (por ejemplo, dos tipos de intervención igual de citados) no se publica: queda en «no encontrado» con su motivo.
 */
export interface CampoNativo { valor: string; pagina: number; cita: string }
export interface ExtraccionNativa {
  campos: Record<string, CampoNativo>;
  no_encontrados: Array<{ campo: string; motivo: string }>;
  direcciones_distintas: number;
}

const ESPERADOS: Record<string, string[]> = {
  RESOLUCION_DEMOLICION: ['intervencion', 'resolucion_numero', 'direccion', 'matricula_inmobiliaria'],
  VISITA_SOPORTE_TECNICO: ['direccion', 'codigo_atc'],
};

const INTERVENCIONES: Array<[RegExp, string]> = [
  [/demolici[oó]n|derribo|implosi[oó]n/gi, 'DEMOLICION'],
  [/izaje|gr[uú]as?\b/gi, 'IZAJE_GRUAS'],
  [/\brcd\b|escombros|residuos de construcci[oó]n/gi, 'RCD'],
  [/maquinaria/gi, 'MAQUINARIA'],
];
const RE_DIRECCION = /\b(?:calle|carrera|cra\.?|cl\.?|avenida|av\.?|diagonal|transversal)\s*\d{1,3}\s?[A-Za-z]?\s*(?:#|n[oº°.]*|no\.?)?\s*\d{1,3}\s?[A-Za-z]?\s*[-–]\s*\d{1,3}\b/gi;
const RE_RESOLUCION = /resoluci[oó]n\s+(?:no\.?\s*)?(\d{4}\.\d{3}\.21\.\d\.\d{3})\s*(?:de|-)\s*(\d{4})/i;
const RE_ATC = /c[oó]digo\s+de\s+edificaci[oó]n\s*:?\s*(\d{5}-\d-\d{7})/i;
const RE_MATRICULA = /matr[ií]cula\s+inmobiliaria(?:\s+matriz)?\s*(?:de\s+mayor\s+extensi[oó]n)?\s*(?:es\s+)?(?:el\s+)?(?:n[oº°.]*\s*)?(\d{3}-\d{4,8})/i;

const cita = (t: string, i: number, largo: number) => t.slice(Math.max(0, i - 40), i + largo + 40).replace(/\s+/g, ' ').trim().slice(0, 220);

export function extraerNativo(paginas: Array<{ pagina: number; texto: string }>, categoria: string | null): ExtraccionNativa {
  const campos: Record<string, CampoNativo> = {};
  const no: Array<{ campo: string; motivo: string }> = [];
  const texto = (p: { texto: string }) => p.texto.replace(/\s+/g, ' ');

  // Tipo de intervención: el más citado; si hay empate entre tipos, no se elige ninguno.
  const cuenta = INTERVENCIONES.map(([re, tipo]) => {
    let n = 0; let primera: { pagina: number; i: number; largo: number } | null = null;
    for (const p of paginas) for (const m of texto(p).matchAll(re)) { n++; if (!primera) primera = { pagina: p.pagina, i: m.index ?? 0, largo: m[0].length }; }
    return { tipo, n, primera };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (cuenta.length === 0) no.push({ campo: 'intervencion', motivo: 'ninguna palabra de intervención en el texto' });
  else if (cuenta.length > 1 && cuenta[0].n === cuenta[1].n) no.push({ campo: 'intervencion', motivo: `ambiguo: ${cuenta[0].tipo} y ${cuenta[1].tipo} igual de citados` });
  else {
    const g = cuenta[0]; const p = paginas.find((x) => x.pagina === g.primera!.pagina)!;
    campos.intervencion = { valor: g.tipo, pagina: g.primera!.pagina, cita: cita(texto(p), g.primera!.i, g.primera!.largo) };
  }

  const direcciones = new Map<string, CampoNativo>();
  for (const p of paginas) for (const m of texto(p).matchAll(RE_DIRECCION)) {
    const k = m[0].toLowerCase().replace(/[\s.#ºo°no]+/g, '');
    if (!direcciones.has(k)) direcciones.set(k, { valor: m[0].trim(), pagina: p.pagina, cita: cita(texto(p), m.index ?? 0, m[0].length) });
  }
  if (direcciones.size === 0) no.push({ campo: 'direccion', motivo: 'no hay una dirección en el texto' });
  else {
    campos.direccion = [...direcciones.values()][0];
    if (direcciones.size > 1) no.push({ campo: 'direccion_alternativas', motivo: `${direcciones.size} direcciones distintas citadas; se conserva la primera sin elegir entre ellas` });
  }

  const una = (clave: string, re: RegExp, formar: (m: RegExpExecArray) => string, motivo: string) => {
    for (const p of paginas) {
      const t = texto(p); const m = re.exec(t);
      if (m) { campos[clave] = { valor: formar(m), pagina: p.pagina, cita: cita(t, m.index, m[0].length) }; return; }
    }
    no.push({ campo: clave, motivo });
  };
  una('resolucion_numero', RE_RESOLUCION, (m) => `${m[1]}-${m[2]}`, 'no consta un número de resolución con formato municipal');
  una('codigo_atc', RE_ATC, (m) => m[1], 'no consta un código de evaluación ATC-20');
  una('matricula_inmobiliaria', RE_MATRICULA, (m) => m[1], 'no consta la matrícula inmobiliaria del predio');

  // Solo se informa como «no encontrado» lo que se esperaba para ese tipo de documento.
  const esperados = categoria ? ESPERADOS[categoria] : null;
  const relevantes = esperados ? no.filter((x) => esperados.includes(x.campo.replace('_alternativas', ''))) : no.filter((x) => x.campo === 'intervencion');
  const noEsperados = Object.keys(campos).filter((k) => esperados && !esperados.includes(k));
  for (const k of noEsperados) delete campos[k];
  return { campos, no_encontrados: relevantes, direcciones_distintas: direcciones.size };
}

export { extraerAreasNativas };
