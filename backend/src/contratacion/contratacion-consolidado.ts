import type { HojaTabla } from './contratacion-excel';
import { letraColumna } from './contratacion-excel';
import { compararEdificio, EdificioRegistrado } from './contratacion-edificios-match';
import { normalizar } from './contratacion-sugerencias';

/**
 * Consolidado de seguimiento (Excel de presentación): una fila por edificación con dirección, estado, avance, valor, m², valor/m² y responsable.
 * Lectura nativa por hoja y celda (sin OCR ni API); las fórmulas no se evalúan: se usa el resultado almacenado y se conserva el texto de la fórmula.
 * Es una fuente REPORTADA: el estado «CONTRATADO» o el avance «COMPLETADO» no verifican un contrato firmado ni un acta de terminación.
 */
export interface FilaConsolidado {
  hoja: string;
  fila: number;
  nombre: string;
  direccion: string | null;
  estado: string | null;
  avance: string | null;
  valor: number | null;
  area_m2: number | null;
  valor_m2: number | null;
  responsable: string | null;
  formula_valor: string | null;
  /** Celda de origen de cada dato (p. ej. { valor: 'E2', area_m2: 'F2' }). */
  celdas: Record<string, string>;
}

const CLAVES: Record<string, keyof Omit<FilaConsolidado, 'hoja' | 'fila' | 'formula_valor' | 'celdas'>> = {
  'nombre edificacion': 'nombre',
  'direccion': 'direccion',
  'estado': 'estado',
  'avance demolicion': 'avance',
  'valor demolicion': 'valor',
  'metros cuadrados': 'area_m2',
  'valor por metro cuadrado': 'valor_m2',
  'responsable': 'responsable',
};

const norm = (v: unknown) => normalizar(String(v ?? '')).replace(/\s+/g, ' ').trim();
const texto = (v: unknown): string | null => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t : null; };
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Fecha de corte escrita en el nombre del archivo («…_11_11_26_.xlsx» → 2026-11-11); null si no consta. */
export function fechaDeCorte(nombreArchivo: string): string | null {
  const m = /(?:^|[^\d])(\d{2})[_\-.](\d{2})[_\-.](\d{2})(?:[^\d]|$)/.exec(nombreArchivo);
  if (!m) return null;
  const [dd, mm, aa] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `20${String(aa).padStart(2, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function leerConsolidado(hojas: HojaTabla[]): { filas: FilaConsolidado[]; hojasLeidas: string[] } {
  const filas: FilaConsolidado[] = [];
  const hojasLeidas: string[] = [];
  for (const h of hojas) {
    // Encabezado: la primera fila (de las 10 primeras) que trae «nombre edificación», «valor demolición» y «metros cuadrados».
    let cab: Map<number, string> | null = null;
    let filaCab = 0;
    for (const [r, cols] of h.filas) {
      if (r > 10) break;
      const encontrados = new Map<number, string>();
      for (const [c, cel] of cols) { const k = CLAVES[norm(cel.valor)]; if (k) encontrados.set(c, k); }
      const claves = new Set(encontrados.values());
      if (claves.has('nombre') && claves.has('valor') && claves.has('area_m2')) { cab = encontrados; filaCab = r; break; }
    }
    if (!cab) continue;
    hojasLeidas.push(h.nombre);
    const colDe = new Map<string, number>([...cab.entries()].map(([c, k]) => [k, c]));
    for (const [r, cols] of [...h.filas.entries()].sort((a, b) => a[0] - b[0])) {
      if (r <= filaCab) continue;
      const nombre = texto(cols.get(colDe.get('nombre')!)?.valor);
      if (!nombre) continue;
      const celda = (k: string) => cols.get(colDe.get(k) ?? -1);
      const ref = (k: string) => (colDe.has(k) ? `${letraColumna(colDe.get(k)!)}${r}` : '');
      const celdas: Record<string, string> = {};
      for (const k of colDe.keys()) celdas[k] = ref(k);
      filas.push({
        hoja: h.nombre, fila: r, nombre,
        direccion: texto(celda('direccion')?.valor), estado: texto(celda('estado')?.valor), avance: texto(celda('avance')?.valor),
        valor: numero(celda('valor')?.valor), area_m2: numero(celda('area_m2')?.valor), valor_m2: numero(celda('valor_m2')?.valor),
        responsable: texto(celda('responsable')?.valor), formula_valor: celda('valor')?.formula ?? null, celdas,
      });
    }
  }
  return { filas, hojasLeidas };
}

/** Clave comparable de una dirección («Carrera 44 # 9-08» ≈ «Cra 44#9 - 08»). */
export function claveDireccion(d: string | null | undefined): string | null {
  const m = /\b(carrera|cra|kr|calle|cl|avenida|av|diagonal|transversal)\.?\s*(\d+\s*[a-z]?)\s*(?:#|no\.?|n°|nro\.?)\s*(\d+\s*[a-z]?)\s*-\s*(\d+)/i.exec(d ?? '');
  if (!m) return null;
  const tipo: Record<string, string> = { carrera: 'cra', cra: 'cra', kr: 'cra', calle: 'cl', cl: 'cl', avenida: 'av', av: 'av', diagonal: 'dg', transversal: 'tv' };
  const n = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return `${tipo[m[1].toLowerCase()]}${n(m[2])}#${n(m[3])}-${m[4]}`;
}

export type VinculoConsolidado = 'NOMBRE_EXACTO' | 'NOMBRE_Y_DIRECCION';

/**
 * Edificio registrado al que corresponde una fila: solo con evidencia inequívoca (nombre igual, o nombre contenido y dirección igual a la registrada).
 * Un nombre parecido sin dirección coincidente NO vincula: la fila se muestra por su propio nombre del consolidado.
 */
export function vincularFilaConsolidado(
  fila: Pick<FilaConsolidado, 'nombre' | 'direccion'>,
  registrados: Array<EdificioRegistrado & { direccion: string | null }>,
): { edificio_id: number; por: VinculoConsolidado } | null {
  const c = compararEdificio(fila.nombre, registrados);
  if (c.edificio_id === null) return null;
  if (c.estado === 'COINCIDE') {
    // Dos registrados con el mismo núcleo de nombre serían ambiguos.
    const mismos = registrados.filter((r) => compararEdificio(fila.nombre, [r]).estado === 'COINCIDE');
    return mismos.length === 1 ? { edificio_id: c.edificio_id, por: 'NOMBRE_EXACTO' } : null;
  }
  const reg = registrados.find((r) => r.id === c.edificio_id);
  const a = claveDireccion(fila.direccion);
  if (c.estado === 'POSIBLE' && reg && a && a === claveDireccion(reg.direccion)) return { edificio_id: c.edificio_id, por: 'NOMBRE_Y_DIRECCION' };
  return null;
}
