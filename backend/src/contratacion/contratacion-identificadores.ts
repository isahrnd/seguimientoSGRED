/**
 * Números de proceso y de contrato del formato municipal «DDDD.DDD.SS.D.NNN-AAAA».
 * El segmento SS (tercero) identifica el tipo de acto: 32 = proceso de contratación, 26 = contrato, 21 = resolución, 27 = convenio.
 * Un número se clasifica por su segmento y por la etiqueta que lo antecede («proceso», «contrato»…). Si ambos coinciden, es firme;
 * si se contradicen, o el segmento no es conocido, queda AMBIGUO y no se usa para asociar nada. Nunca se convierte un contrato en proceso
 * ni al revés, y un contrato sin proceso citado no deja resuelto el proceso.
 */
export type TipoIdentificador = 'PROCESO' | 'CONTRATO' | 'RESOLUCION' | 'CONVENIO';

export const SEGMENTO_TIPO: Record<string, TipoIdentificador> = { '32': 'PROCESO', '26': 'CONTRATO', '21': 'RESOLUCION', '27': 'CONVENIO' };

export interface IdentificadorHallado {
  /** Forma normalizada «4163.001.32.1.NNN-AAAA»; null si la lectura no es fiable (OCR). */
  valor: string | null;
  leido: string;
  segmento: string | null;
  /** Tipo deducido del segmento (null si el segmento no es de un formato conocido). */
  tipo_segmento: TipoIdentificador | null;
  /** Tipo indicado por la etiqueta cercana. */
  tipo_etiqueta: TipoIdentificador | null;
  /** Tipo firme: solo si segmento y etiqueta no se contradicen (la etiqueta ausente no contradice). */
  tipo: TipoIdentificador | null;
  ambiguo: boolean;
  motivo: string | null;
  posicion: number;
}

const D = String.raw`[\dOoIlSBZz]`; // dígitos o letras que el OCR confunde con ellos
const RE_CANDIDATO = new RegExp(String.raw`(?<![\d.])(${D}{4})([.,]|\s)(${D}{3})([.,]|\s)(${D}{2})([.,]|\s)(${D})([.,]|\s)(${D}{3})\s*[-–—]\s*(${D}{4})(?![\d])`, 'g');

const ETIQUETAS: Array<[RegExp, TipoIdentificador]> = [
  [/proceso|licitaci|selecci[oó]n abreviada|m[ií]nima cuant/gi, 'PROCESO'],
  [/contra\s?to/gi, 'CONTRATO'],
  [/resoluci[oó]n/gi, 'RESOLUCION'],
  [/convenio/gi, 'CONVENIO'],
];

/** Etiqueta más cercana en los 70 caracteres anteriores (el rótulo que introduce el número). */
function etiquetaPrevia(texto: string, pos: number): TipoIdentificador | null {
  const ventana = texto.slice(Math.max(0, pos - 70), pos);
  let mejor: { i: number; t: TipoIdentificador } | null = null;
  for (const [re, t] of ETIQUETAS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ventana))) if (!mejor || m.index > mejor.i) mejor = { i: m.index, t };
  }
  return mejor?.t ?? null;
}

export function extraerIdentificadores(texto: string): IdentificadorHallado[] {
  const t = (texto ?? '').replace(/\s+/g, ' ');
  const out: IdentificadorHallado[] = [];
  RE_CANDIDATO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_CANDIDATO.exec(t))) {
    const leido = m[0];
    const partes = [m[1], m[3], m[5], m[7], m[9], m[10]];
    const seps = [m[2], m[4], m[6], m[8]];
    const soloDigitos = partes.every((p) => /^\d+$/.test(p));
    const sepsLimpios = seps.every((s) => s === '.');
    const segmento = /^\d{2}$/.test(partes[2]) ? partes[2] : null;
    const tipoSeg = segmento ? SEGMENTO_TIPO[segmento] ?? null : null;
    const tipoEt = etiquetaPrevia(t, m.index);
    const base = { leido, segmento, tipo_segmento: tipoSeg, tipo_etiqueta: tipoEt, posicion: m.index };
    if (!soloDigitos || !sepsLimpios) {
      out.push({ ...base, valor: null, tipo: null, ambiguo: true, motivo: 'lectura dudosa (posible error de OCR en dígitos o separadores)' });
      continue;
    }
    const valor = `${partes[0]}.${partes[1]}.${partes[2]}.${partes[3]}.${partes[4]}-${partes[5]}`;
    if (!tipoSeg) {
      out.push({ ...base, valor, tipo: null, ambiguo: true, motivo: `el segmento .${segmento}. no es de un formato conocido` });
    } else if (tipoEt && tipoEt !== tipoSeg) {
      out.push({ ...base, valor, tipo: null, ambiguo: true, motivo: `la etiqueta indica ${tipoEt.toLowerCase()} pero el segmento .${segmento}. corresponde a ${tipoSeg.toLowerCase()}` });
    } else {
      out.push({ ...base, valor, tipo: tipoSeg, ambiguo: false, motivo: null });
    }
  }
  return out;
}

const distintos = (xs: IdentificadorHallado[], tipo: TipoIdentificador) => [...new Set(xs.filter((x) => !x.ambiguo && x.tipo === tipo).map((x) => x.valor as string))];

export interface ResumenIdentificadores {
  procesos: string[];
  contratos: string[];
  ambiguos: IdentificadorHallado[];
  /** Hay dos o más procesos (o contratos) distintos: no se elige ninguno. */
  contradictorios: { procesos: boolean; contratos: boolean };
}

export function resumirIdentificadores(texto: string): ResumenIdentificadores {
  const todos = extraerIdentificadores(texto);
  const procesos = distintos(todos, 'PROCESO');
  const contratos = distintos(todos, 'CONTRATO');
  return { procesos, contratos, ambiguos: todos.filter((x) => x.ambiguo), contradictorios: { procesos: procesos.length > 1, contratos: contratos.length > 1 } };
}

/** El número de proceso del texto: solo uno, de segmento .32. y sin etiqueta contraria; con varios distintos o ninguno, null. */
export function procesoUnico(texto: string): string | null {
  const r = resumirIdentificadores(texto);
  return r.procesos.length === 1 ? r.procesos[0] : null;
}

/** El número de contrato del texto (segmento .26.), con las mismas garantías. */
export function contratoUnico(texto: string): string | null {
  const r = resumirIdentificadores(texto);
  return r.contratos.length === 1 ? r.contratos[0] : null;
}

/** Tipo firme de un número ya normalizado, por su segmento. */
export function tipoPorSegmento(valor: string): TipoIdentificador | null {
  const m = /^\d{4}\.\d{3}\.(\d{2})\.\d\.\d{3}-\d{4}$/.exec(valor);
  return m ? SEGMENTO_TIPO[m[1]] ?? null : null;
}
