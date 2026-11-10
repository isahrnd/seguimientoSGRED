/**
 * Lectura SEGURA de hojas de cálculo: solo valores almacenados como datos.
 * No evalúa fórmulas (usa el resultado en caché), no ejecuta macros (.xlsx no las contiene)
 * y no sigue enlaces: un hipervínculo se muestra solo como su texto.
 */
export const MAX_BYTES_EXCEL = 15 * 1024 * 1024;
const MAX_TEXTO = 200;

export type CeldaVista = string | number | boolean | null;

export interface HojaVista {
  indice: number;
  nombre: string;
  filas: CeldaVista[][];
  total_filas: number;
  total_columnas: number;
  truncado: boolean;
}

function colLetra(n: number): string {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function valorComoDato(v: any): CeldaVista {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, MAX_TEXTO);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('').slice(0, MAX_TEXTO);
    if ('result' in v) return valorComoDato(v.result); // fórmula: solo el resultado almacenado
    if ('formula' in v || 'sharedFormula' in v) return null;
    if (typeof v.text === 'string') return v.text.slice(0, MAX_TEXTO); // hipervínculo: solo texto
    if ('error' in v) return String(v.error).slice(0, 20);
  }
  return null;
}

async function cargar(buf: Buffer): Promise<any> {
  if (buf.length > MAX_BYTES_EXCEL) throw new Error('Archivo demasiado grande para la vista previa');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

/** Lista de hojas y una muestra de celdas con texto para indexar y justificar sugerencias. */
export async function extraerCeldas(buf: Buffer, opciones = { maxHojas: 8, maxCeldas: 400 }) {
  const wb = await cargar(buf);
  const hojas: { nombre: string; filas: number; columnas: number }[] = [];
  const celdas: { ref: string; texto: string }[] = [];
  wb.worksheets.slice(0, opciones.maxHojas).forEach((ws: any) => {
    hojas.push({ nombre: ws.name, filas: ws.rowCount, columnas: ws.columnCount });
    ws.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      row.eachCell({ includeEmpty: false }, (cell: any, c: number) => {
        if (celdas.length >= opciones.maxCeldas) return;
        const d = valorComoDato(cell.value);
        if (typeof d === 'string' && d.trim().length >= 3) celdas.push({ ref: `${ws.name}!${colLetra(c)}${r}`, texto: d });
      });
    });
  });
  return { hojas, celdas };
}

export async function leerHoja(buf: Buffer, indice: number, limites = { maxFilas: 200, maxColumnas: 30 }) {
  const wb = await cargar(buf);
  const hojas = wb.worksheets.map((ws: any, i: number) => ({ indice: i, nombre: ws.name as string }));
  const ws = wb.worksheets[indice];
  if (!ws) return { hojas, hoja: null as HojaVista | null };
  const totalFilas = ws.rowCount as number;
  const totalColumnas = ws.columnCount as number;
  const filas: CeldaVista[][] = [];
  for (let r = 1; r <= Math.min(totalFilas, limites.maxFilas); r++) {
    const fila: CeldaVista[] = [];
    for (let c = 1; c <= Math.min(totalColumnas, limites.maxColumnas); c++) fila.push(valorComoDato(ws.getRow(r).getCell(c).value));
    filas.push(fila);
  }
  return {
    hojas,
    hoja: { indice, nombre: ws.name, filas, total_filas: totalFilas, total_columnas: totalColumnas, truncado: totalFilas > limites.maxFilas || totalColumnas > limites.maxColumnas } as HojaVista,
  };
}

/** Valor (como dato, en texto) de celdas puntuales; null si la hoja o la celda no existen o están vacías. */
export async function leerCeldas(buf: Buffer, refs: Array<{ hoja: string; celda: string }>): Promise<Array<string | null>> {
  const wb = await cargar(buf);
  return refs.map(({ hoja, celda }) => {
    const ws = wb.getWorksheet(hoja);
    if (!ws) return null;
    const v = valorComoDato(ws.getCell(celda).value);
    return v === null || v === undefined ? null : String(v);
  });
}

export interface CeldaTabla { valor: CeldaVista; enlace: string | null }
export interface HojaTabla { nombre: string; filas: Map<number, Map<number, CeldaTabla>> }

/**
 * Lectura de tablas completas (todas las hojas, hasta `maxFilas`), conservando el valor numérico tal cual está almacenado
 * (centavos incluidos) y el destino de un hipervínculo como texto (nunca se abre ni se sigue). Posiciones 1-indexadas.
 */
export async function leerTablas(buf: Buffer, limites = { maxHojas: 8, maxFilas: 500, maxColumnas: 30 }): Promise<HojaTabla[]> {
  const wb = await cargar(buf);
  return wb.worksheets.slice(0, limites.maxHojas).map((ws: any) => {
    const filas = new Map<number, Map<number, CeldaTabla>>();
    ws.eachRow({ includeEmpty: false }, (row: any, r: number) => {
      if (r > limites.maxFilas) return;
      const cols = new Map<number, CeldaTabla>();
      row.eachCell({ includeEmpty: false }, (cell: any, c: number) => {
        if (c > limites.maxColumnas) return;
        const v = cell.value;
        const enlace = v && typeof v === 'object' && typeof v.hyperlink === 'string' ? v.hyperlink.slice(0, 2000) : null;
        cols.set(c, { valor: valorComoDato(v), enlace });
      });
      filas.set(r, cols);
    });
    return { nombre: ws.name as string, filas };
  });
}

export function letraColumna(n: number): string {
  return colLetra(n);
}
