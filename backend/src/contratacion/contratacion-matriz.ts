import { CeldaTabla, HojaTabla, letraColumna } from './contratacion-excel';

/**
 * Matriz de contratación (p. ej. «Requerimiento Contraloria.xlsx»): una fila por contrato, con proceso y contrato como
 * identificadores distintos. Se identifican las columnas por su encabezado, no por su posición.
 */
export type AlcanceMatriz = 'DEMOLICION' | 'RCD' | 'GRUAS' | 'MAQUINARIA' | 'CONVENIO' | 'OPERACION_LOGISTICA' | 'OTRO';

export const ALCANCE_MATRIZ_ETQ: Record<AlcanceMatriz, string> = {
  DEMOLICION: 'Demolición',
  RCD: 'Recolección o transporte de RCD',
  GRUAS: 'Alquiler de grúas',
  MAQUINARIA: 'Alquiler de maquinaria',
  CONVENIO: 'Convenio',
  OPERACION_LOGISTICA: 'Operación logística',
  OTRO: 'Otro alcance',
};

export interface FilaMatriz {
  hoja: string;
  fila: number;
  tipo_hoja: 'COMPRAS' | 'ADICION';
  proceso_original: string | null;
  contrato_original: string | null;
  proceso_norm: string | null;
  contrato_norm: string | null;
  modalidad: string | null;
  objeto: string | null;
  valor: number | null;
  estado: string | null;
  contratista: string | null;
  secop_url: string | null;
  celdas: Record<string, string>; // campo → referencia (B6, D6…)
  alcance: AlcanceMatriz;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Identificador comparable: sin espacios, con un solo tipo de guion, en mayúsculas. */
export function normalizarId(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, '').toUpperCase();
  return t || null;
}

/** Forma legible y estable de un identificador: sin espacios internos ni guiones tipográficos. */
export function identificadorLimpio(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, '');
  return t || null;
}

export function importeDeCelda(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/[^\d.,-]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function clasificarAlcance(modalidad: string | null, objeto: string | null): AlcanceMatriz {
  const m = sinTildes(modalidad ?? '');
  const o = sinTildes(objeto ?? '');
  if (/convenio/.test(m) || /convenio de asociacion/.test(o)) return 'CONVENIO';
  if (/operador logistico|soporte logistico|logistic/.test(o)) return 'OPERACION_LOGISTICA';
  if (/gruas?\b/.test(o) || /izaje/.test(o)) return 'GRUAS';
  if (/demolicion|repique/.test(o)) return 'DEMOLICION';
  if (/maquinaria|retroexcavadora|excavadora/.test(o) || /maquinaria/.test(m)) return 'MAQUINARIA';
  if (/\brcd\b|escombros|residuos de construccion/.test(o)) return 'RCD';
  return 'OTRO';
}

const COLUMNAS: Array<[string, RegExp]> = [
  ['proceso_original', /^numero de proceso/],
  ['modalidad', /^modalidad/],
  ['contrato_original', /^numero de contrato/],
  ['objeto', /^objeto/],
  ['valor', /^valor/],
  ['estado', /^estado/],
  ['contratista', /^contratista/],
  ['link', /^link\b|secop/],
];

const texto = (c?: CeldaTabla) => (c && c.valor !== null && c.valor !== undefined && String(c.valor).trim() !== '' ? String(c.valor).trim() : null);

/** Lee las hojas COMPRAS y ADICION (o cualquier hoja con los encabezados de la matriz) y devuelve una fila por contrato. */
export function leerMatriz(hojas: HojaTabla[]): { filas: FilaMatriz[]; hojasLeidas: string[] } {
  const filas: FilaMatriz[] = [];
  const hojasLeidas: string[] = [];
  for (const h of hojas) {
    let cab: number | null = null;
    const col: Record<string, number> = {};
    for (const [r, cols] of [...h.filas.entries()].sort((a, b) => a[0] - b[0]).slice(0, 10)) {
      const enc: Record<string, number> = {};
      for (const [c, cel] of cols) {
        const t = sinTildes(String(cel.valor ?? ''));
        for (const [campo, re] of COLUMNAS) if (!(campo in enc) && re.test(t)) enc[campo] = c;
      }
      if ('proceso_original' in enc && 'contrato_original' in enc && 'valor' in enc) {
        cab = r;
        Object.assign(col, enc);
        break;
      }
    }
    if (cab === null) continue;
    hojasLeidas.push(h.nombre);
    const tipo_hoja: 'COMPRAS' | 'ADICION' = /adicion/.test(sinTildes(h.nombre)) ? 'ADICION' : 'COMPRAS';
    for (const [r, cols] of [...h.filas.entries()].sort((a, b) => a[0] - b[0])) {
      if (r <= cab) continue;
      const g = (campo: string): CeldaTabla | undefined => (col[campo] ? cols.get(col[campo]) : undefined);
      const proceso = texto(g('proceso_original'));
      const contrato = texto(g('contrato_original'));
      if (!proceso && !contrato) continue;
      const link = g('link');
      const url = link?.enlace ?? (typeof link?.valor === 'string' && /^https?:\/\//i.test(link.valor) ? link.valor : null);
      const modalidad = texto(g('modalidad'));
      const objeto = texto(g('objeto'));
      const celdas: Record<string, string> = {};
      for (const campo of ['proceso_original', 'contrato_original', 'valor', 'link', 'objeto', 'contratista', 'modalidad', 'estado']) {
        if (col[campo] && g(campo)) celdas[campo] = `${letraColumna(col[campo])}${r}`;
      }
      filas.push({
        hoja: h.nombre, fila: r, tipo_hoja,
        proceso_original: proceso, contrato_original: contrato, proceso_norm: normalizarId(proceso), contrato_norm: normalizarId(contrato),
        modalidad, objeto, valor: importeDeCelda(g('valor')?.valor), estado: texto(g('estado')), contratista: texto(g('contratista')),
        secop_url: url, celdas, alcance: clasificarAlcance(modalidad, objeto),
      });
    }
  }
  return { filas, hojasLeidas };
}

export interface ExpedienteVinculable {
  id: number;
  proceso: string;
  numero_contrato: string | null;
}

/**
 * Vincula una fila con su expediente por proceso o, si no, por contrato (ambos normalizados). Si más de un expediente
 * coincide no vincula: queda para revisión.
 */
export function vincularFila(
  f: Pick<FilaMatriz, 'proceso_norm' | 'contrato_norm'>,
  exps: ExpedienteVinculable[],
): { expedienteId: number; por: 'PROCESO' | 'CONTRATO' } | null {
  if (f.proceso_norm) {
    const m = exps.filter((e) => normalizarId(e.proceso) === f.proceso_norm);
    if (m.length === 1) return { expedienteId: m[0].id, por: 'PROCESO' };
    if (m.length > 1) return null;
  }
  if (f.contrato_norm) {
    const m = exps.filter((e) => normalizarId(e.numero_contrato) === f.contrato_norm || normalizarId(e.proceso) === f.contrato_norm || normalizarId(e.proceso) === `CONTRATO-${f.contrato_norm}`);
    if (m.length === 1) return { expedienteId: m[0].id, por: 'CONTRATO' };
  }
  return null;
}
