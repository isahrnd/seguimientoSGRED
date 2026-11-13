import { nucleo, similitud } from './contratacion-edificios-match';

/**
 * Relación de las filas de una oferta con los edificios registrados, por el CONTENIDO de la propia tabla (nombre que consta en la fila), sin usar la
 * carpeta ni el nombre del archivo. Reglas deterministas, sin Claude:
 *  - NOMBRE_EXACTO: el núcleo del nombre coincide con el de un único edificio registrado.
 *  - VARIANTE_TIPOGRAFICA: nombre muy parecido (p. ej. «Archinnal» o «Archinal» por «Archinall») con un único candidato claro.
 *  - NOMBRE_CONTENIDO: el nombre de la fila está contenido en el de un único edificio registrado (p. ej. «María Mercedes» en «María Mercedes Lloraza»).
 * Si dos edificios son candidatos, o ninguno lo es, no se relaciona: queda como caso para aclarar, con el dato concreto que falta.
 * El total de una oferta conjunta (fila sin edificio) nunca se atribuye a ningún edificio.
 */
export interface EdificioRegistrado { id: number; nombre: string }
export type MetodoRelacion = 'NOMBRE_EXACTO' | 'VARIANTE_TIPOGRAFICA' | 'NOMBRE_CONTENIDO';
export interface FilaOferta { edificio: string | null; pagina: number | null; importe: number | null; alcance: string }
export interface PropuestaRelacion {
  etiqueta: string; pagina: number | null; importe: number | null;
  candidato: EdificioRegistrado | null; metodo: MetodoRelacion | null; similitud: number;
  estado: 'YA_VINCULADO' | 'APLICABLE' | 'AMBIGUA' | 'SIN_EDIFICIO_REGISTRADO';
  falta: string | null;
}

const PREFIJO_GENERICO = /^(?:edificio|ed\.?|dificio|conjunto residencial|conjunto|multifamiliar|centro comercial)\s+/i;

export function evaluarEtiqueta(etiqueta: string, registrados: EdificioRegistrado[]): { candidato: EdificioRegistrado | null; metodo: MetodoRelacion | null; similitud: number; ambigua: boolean } {
  const n = nucleo(etiqueta.replace(PREFIJO_GENERICO, ''));
  if (n.length < 4) return { candidato: null, metodo: null, similitud: 0, ambigua: false };
  const puntuados = registrados.map((r) => {
    const m = nucleo(r.nombre.replace(PREFIJO_GENERICO, ''));
    const exacto = n === m || nucleo(etiqueta) === nucleo(r.nombre);
    const contenido = n.length >= 7 && m.length >= 7 && (m.includes(n) || n.includes(m)) && Math.min(n.length, m.length) >= 7;
    return { r, s: exacto ? 1 : contenido ? 0.9 : similitud(n, m), exacto, contenido };
  }).sort((a, b) => b.s - a.s);
  const [a, b] = puntuados;
  if (!a || a.s < 0.75) return { candidato: null, metodo: null, similitud: a?.s ?? 0, ambigua: false };
  // Más de un edificio igual de bueno: no se elige uno.
  if (b && b.s >= a.s - 0.1 && b.s >= 0.75) return { candidato: null, metodo: null, similitud: a.s, ambigua: true };
  const metodo: MetodoRelacion = a.exacto ? 'NOMBRE_EXACTO' : a.contenido ? 'NOMBRE_CONTENIDO' : 'VARIANTE_TIPOGRAFICA';
  return { candidato: a.r, metodo, similitud: Math.round(a.s * 100) / 100, ambigua: false };
}

export function proponerRelaciones(filas: FilaOferta[], registrados: EdificioRegistrado[], yaVinculados: number[]): PropuestaRelacion[] {
  const salida: PropuestaRelacion[] = [];
  for (const f of filas) {
    if (!f.edificio) continue; // totales de la oferta: no son de ningún edificio
    const ev = evaluarEtiqueta(f.edificio, registrados);
    const base = { etiqueta: f.edificio, pagina: f.pagina, importe: f.importe, similitud: ev.similitud };
    if (ev.candidato) {
      salida.push({ ...base, candidato: ev.candidato, metodo: ev.metodo, estado: yaVinculados.includes(ev.candidato.id) ? 'YA_VINCULADO' : 'APLICABLE', falta: null });
    } else if (ev.ambigua) {
      salida.push({ ...base, candidato: null, metodo: null, estado: 'AMBIGUA', falta: 'Dirección o identificador del inmueble para elegir entre dos edificios registrados de nombre parecido' });
    } else {
      salida.push({ ...base, candidato: null, metodo: null, estado: 'SIN_EDIFICIO_REGISTRADO', falta: 'No hay un edificio registrado con ese nombre: falta su dirección, matrícula o resolución para registrarlo' });
    }
  }
  return salida;
}

const MET: Record<MetodoRelacion, string> = { NOMBRE_EXACTO: 'nombre igual', VARIANTE_TIPOGRAFICA: 'nombre con variante de escritura', NOMBRE_CONTENIDO: 'nombre contenido en el registrado' };

/** Texto de trazabilidad (≤ 400 caracteres) de una relación aplicada por el asistente. */
export function evidenciaRelacion(documento: string, p: PropuestaRelacion): string {
  const cop = p.importe !== null ? ` ($${p.importe.toLocaleString('es-CO', { maximumFractionDigits: 2 })})` : '';
  const t = `Comprobación documental del asistente (no es una confirmación humana). En la tabla${p.pagina ? ` de la p. ${p.pagina}` : ''} de «${documento.replace(/\.pdf$/i, '').slice(0, 60)}» la fila «${p.etiqueta}»${cop} corresponde al edificio «${p.candidato!.nombre}» (${MET[p.metodo!]}; único candidato registrado). No se asigna a este edificio el total de una oferta conjunta.`;
  return t.slice(0, 400);
}
