import * as ExcelJS from 'exceljs';
import { FilaResumen } from './contratacion-resumen';

const COLS: Array<{ k: keyof FilaResumen; t: string; w: number; moneda?: boolean }> = [
  { k: 'proceso', t: 'Proceso', w: 26 }, { k: 'contrato', t: 'Contrato', w: 26 }, { k: 'intervencion', t: 'Intervención', w: 40 }, { k: 'edificaciones', t: 'Edificaciones', w: 30 },
  { k: 'contratista', t: 'Contratista / empresa', w: 26 }, { k: 'estado', t: 'Estado', w: 22 },
  { k: 'valor_matriz', t: 'Reportado en matriz', w: 20, moneda: true }, { k: 'fuente_matriz', t: 'Fuente (matriz)', w: 44 },
  { k: 'valor_contrato', t: 'Contrato en soporte', w: 20, moneda: true }, { k: 'fuente_contrato', t: 'Fuente (contrato)', w: 44 },
  { k: 'valor_ejecutado', t: 'Ejecutado con acta', w: 20, moneda: true }, { k: 'fuente_ejecutado', t: 'Fuente (ejecución)', w: 44 },
  { k: 'presupuesto_oficial', t: 'Presupuesto oficial', w: 20, moneda: true }, { k: 'fuente_presupuesto', t: 'Fuente (presupuesto)', w: 44 },
  { k: 'area_m2', t: 'Área documentada (m²)', w: 16 }, { k: 'precio_m2', t: 'Precio por m²', w: 16, moneda: true }, { k: 'nota_m2', t: 'Nota del precio por m²', w: 40 },
  { k: 'pendientes', t: 'Pendiente de verificación', w: 44 }, { k: 'observacion', t: 'Observación', w: 50 },
];

/** Libro con una fila por expediente. Las columnas de matriz, contrato y ejecución no se suman: son fuentes distintas de una misma cifra. */
export async function construirLibroResumen(filas: FilaResumen[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seguimiento SGRED';
  const ws = wb.addWorksheet('Resumen por contrato', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = COLS.map((c) => ({ header: c.t, key: c.k as string, width: c.w, style: c.moneda ? { numFmt: '"$"#,##0.00' } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  for (const f of filas) ws.addRow(f);
  ws.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: 'top' }; });
  const nota = wb.addWorksheet('Cómo leerlo');
  [
    'Cada fila es un expediente. Las columnas «Reportado en matriz», «Contrato en soporte» y «Ejecutado con acta» son fuentes distintas y no se suman entre sí.',
    'Si la matriz y el contrato traen el mismo importe, es una sola cifra con dos fuentes.',
    'El precio por m² es un cálculo (valor ÷ área documentada) y solo aparece con un edificio y un área respaldados.',
    'Las celdas vacías indican información no documentada; no se estiman.',
  ].forEach((t) => nota.addRow([t]));
  nota.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
