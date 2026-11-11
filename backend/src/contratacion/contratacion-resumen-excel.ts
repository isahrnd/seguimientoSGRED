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
export async function construirLibroResumen(filas: FilaResumen[], lectura: any[] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seguimiento SGRED';
  const ws = wb.addWorksheet('Resumen por contrato', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = COLS.map((c) => ({ header: c.t, key: c.k as string, width: c.w, style: c.moneda ? { numFmt: '"$"#,##0.00' } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  for (const f of filas) ws.addRow(f);
  ws.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: 'top' }; });
  // Lectura de documentos (ofertas, partidas, subtotales y totales): por verificar, nunca valor contratado, y sin sumar niveles distintos.
  if (lectura.length) {
    const NIVEL: Record<string, string> = { PARTIDA: 'Partida', SUBTOTAL: 'Subtotal', TOTAL: 'Total', IMPUESTO_O_AIU: 'AIU / impuesto', COMPONENTE_SIN_VALOR: 'Componente sin valor' };
    const wl = wb.addWorksheet('Lectura de documentos', { views: [{ state: 'frozen', ySplit: 1 }] });
    wl.columns = [
      { header: 'Documento', key: 'doc', width: 40 }, { header: 'Origen', key: 'origen', width: 24 }, { header: 'Edificio', key: 'edificio', width: 30 }, { header: 'Alcance', key: 'alcance', width: 50 },
      { header: 'Nivel', key: 'nivel', width: 18 }, { header: 'Importe', key: 'importe', width: 20, style: { numFmt: '"$"#,##0.00' } }, { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Fuente', key: 'fuente', width: 30 }, { header: 'Estado de revisión', key: 'estado', width: 26 }, { header: 'Edificio registrado', key: 'registrado', width: 40 },
    ];
    wl.getRow(1).font = { bold: true };
    const origen: Record<string, string> = { ASISTIDA: 'Lectura asistida', NATIVA: 'Lectura nativa', HOJA_DE_CALCULO: 'Hoja de cálculo' };
    for (const d of lectura) {
      for (const p of d.partidas ?? []) {
        wl.addRow({
          doc: d.documento, origen: origen[d.origen] ?? d.origen, edificio: p.edificio ?? d.campos?.find((c: any) => c.campo === 'edificio')?.valor ?? '', alcance: p.alcance, nivel: NIVEL[p.nivel ?? 'PARTIDA'], importe: p.importe, unidad: p.unidad ?? '',
          fuente: p.fuente ?? (p.pagina ? 'p. ' + p.pagina : ''), estado: p.relacion === 'EXPLICITA' ? 'Por verificar (relación explícita)' : 'Por verificar (relación pendiente)',
          registrado: p.coincidencia ? (p.coincidencia.estado === 'SIN_COINCIDENCIA' ? 'Sin edificio registrado' : (p.coincidencia.estado === 'COINCIDE' ? 'Igual a ' : 'Parecido a ') + p.coincidencia.edificio + (p.coincidencia.vinculado_al_documento ? ' (vinculado)' : ' (no vinculado)')) : '',
        });
      }
      const controles = [...(d.controles_de_suma ?? []).filter((c: any) => c.estado !== 'SIN_TOTAL_DECLARADO').map((c: any) => [c.grupo, c.suma_partidas, c.total_declarado, c.estado]), ...(d.controles_aritmeticos ?? []).map((c: any) => [c.control, c.calculado, c.declarado, c.estado])];
      if ((d.partidas ?? []).length) wl.addRow({ doc: d.documento, alcance: 'Suma solo de partidas (los subtotales, totales e impuestos NO se suman)', nivel: 'Control', importe: d.suma_solo_partidas, estado: controles.map((c) => c[0] + ': ' + (c[3] === 'CUADRA' ? 'cuadra' : 'no cuadra')).join(' | ') });
    }
    const wn = wb.addWorksheet('Datos extraídos');
    wn.columns = [{ header: 'Documento', width: 40 }, { header: 'Origen', width: 24 }, { header: 'Dato', width: 28 }, { header: 'Valor', width: 40 }, { header: 'Fuente', width: 34 }, { header: 'Estado', width: 40 }];
    wn.getRow(1).font = { bold: true };
    for (const d of lectura) {
      for (const c of d.campos ?? []) wn.addRow([d.documento, origen[d.origen] ?? d.origen, c.campo, c.valor, c.fuente ?? (c.pagina ? 'p. ' + c.pagina : ''), 'Por verificar']);
      for (const n of d.no_encontrados ?? []) wn.addRow([d.documento, origen[d.origen] ?? d.origen, n.campo, '', '', 'Dato no encontrado por el extractor: ' + n.motivo]);
    }
  }
  const nota = wb.addWorksheet('Cómo leerlo');
  [
    'Cada fila es un expediente. Las columnas «Reportado en matriz», «Contrato en soporte» y «Ejecutado con acta» son fuentes distintas y no se suman entre sí.',
    'Si la matriz y el contrato traen el mismo importe, es una sola cifra con dos fuentes.',
    'El precio por m² es un cálculo (valor ÷ área documentada) y solo aparece con un edificio y un área respaldados.',
    'Las celdas vacías indican información no documentada; no se estiman.',
    'Hoja «Lectura de documentos»: ofertas y partidas leídas de los documentos, por verificar. Una oferta nunca es un valor contratado; los subtotales, totales e impuestos resumen a las partidas y no se suman a ellas.',
    '«Dato no encontrado por el extractor» no significa que el soporte no exista: indica que la lectura automática no lo halló.',
  ].forEach((t) => nota.addRow([t]));
  nota.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
