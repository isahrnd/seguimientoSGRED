import * as ExcelJS from 'exceljs';
import { fuenteTexto } from './contratacion-informe-pdf';
import { ETQ_PROCEDENCIA, FilaEdificio, fechaCorteTexto } from './contratacion-vista-precios';

/**
 * Libro de Excel de la vista de precios por edificio: las MISMAS filas (y fórmulas) que alimentan la pantalla y el PDF; nada se recalcula aquí.
 * Cada cifra conserva su procedencia y su fuente (documento, página u hoja y celda).
 */
export interface DatosLibroPrecios { fecha_corte: string | null; generado_en: string; filas: FilaEdificio[]; fuentes: Array<{ rotulo: string; documento: string; version_id: number }> }

const MONEDA = '"$"#,##0.00';

export async function construirLibroPrecios(d: DatosLibroPrecios): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Seguimiento SGRED';
  const ws = wb.addWorksheet('Precios por edificio', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = [
    { header: 'Edificio', key: 'nombre', width: 34 }, { header: 'Dirección', key: 'direccion', width: 28 }, { header: 'Responsable', key: 'responsable', width: 18 }, { header: 'Fuente del responsable', key: 'fuente_resp', width: 36 },
    { header: 'Valor', key: 'valor', width: 20, style: { numFmt: MONEDA } }, { header: 'Procedencia del valor', key: 'procedencia', width: 16 }, { header: 'Fuente del valor', key: 'fuente_valor', width: 44 },
    { header: 'Área (m²)', key: 'area', width: 12, style: { numFmt: '#,##0.00' } }, { header: 'Tipo de área', key: 'tipo_area', width: 16 }, { header: 'Fuente del área', key: 'fuente_area', width: 36 },
    { header: 'Valor por m²', key: 'm2', width: 18, style: { numFmt: MONEDA } }, { header: 'Valor por m²: tipo', key: 'tipo_m2', width: 16 }, { header: 'Fuente del valor por m²', key: 'fuente_m2', width: 36 },
    { header: 'Estado', key: 'estado', width: 26 }, { header: 'Contrato conjunto (proceso)', key: 'conj_proceso', width: 26 }, { header: 'Valor del contrato conjunto', key: 'conj_valor', width: 22, style: { numFmt: MONEDA } },
    { header: 'Edificaciones del contrato', key: 'conj_n', width: 14 }, { header: 'Mensajes', key: 'mensajes', width: 44 }, { header: 'Diferencias entre fuentes', key: 'dif', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  for (const f of d.filas) {
    ws.addRow({
      nombre: f.nombre, direccion: f.direccion ?? '', responsable: f.responsable?.nombre ?? '', fuente_resp: f.responsable ? `${f.responsable.etiqueta}. ${fuenteTexto(f.responsable.fuente)}` : '',
      valor: f.valor?.valor ?? null, procedencia: f.valor ? ETQ_PROCEDENCIA[f.valor.procedencia] : f.contrato_conjunto ? 'Contrato conjunto' : '', fuente_valor: f.valor ? `${f.valor.etiqueta}. ${fuenteTexto(f.valor.fuente)}` : '',
      area: f.area?.valor ?? null, tipo_area: f.area ? (f.area.clase === 'DOCUMENTADA' ? 'Documentada' : 'Reportada (consolidado)') : 'Por precisar', fuente_area: fuenteTexto(f.area?.fuente),
      m2: f.valor_m2?.valor ?? null, tipo_m2: f.valor_m2 ? (f.valor_m2.clase === 'CONTRATADO' ? 'Contratado' : 'Reportado (consolidado)') : '', fuente_m2: fuenteTexto(f.valor_m2?.fuente),
      estado: f.estado.etiqueta, conj_proceso: f.contrato_conjunto?.proceso ?? '', conj_valor: f.contrato_conjunto?.valor ?? null, conj_n: f.contrato_conjunto?.edificios ?? null,
      mensajes: f.mensajes.join('; '), dif: f.diferencias.join(' | '),
    });
  }
  ws.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: 'top' }; });

  const wd = wb.addWorksheet('Desglose por oferta', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Edificio', key: 'edificio', width: 30 }, { header: 'Empresa', key: 'empresa', width: 22 }, { header: 'Documento', key: 'documento', width: 34 }, { header: 'Fecha de la oferta', key: 'fecha', width: 14 },
    { header: 'Nivel', key: 'nivel', width: 18 }, { header: 'Actividad / componente', key: 'actividad', width: 58 }, { header: 'Unidad', key: 'unidad', width: 10 }, { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Precio unitario', key: 'unitario', width: 18, style: { numFmt: MONEDA } }, { header: 'Subtotal / valor', key: 'importe', width: 20, style: { numFmt: MONEDA } }, { header: 'Fuente', key: 'fuente', width: 38 },
    { header: 'Relación con el edificio', key: 'relacion', width: 40 },
  ];
  wd.getRow(1).font = { bold: true };
  for (const f of d.filas) {
    for (const o of f.ofertas) {
      const base = { edificio: f.nombre, empresa: o.empresa, documento: o.documento, fecha: o.fecha ?? '', relacion: o.relacion };
      for (const i of o.items) wd.addRow({ ...base, nivel: 'Actividad', actividad: i.actividad, unidad: i.unidad ?? '', cantidad: i.cantidad, unitario: i.precio_unitario, importe: i.subtotal, fuente: fuenteTexto(i.fuente) });
      const c = o.componentes;
      for (const [etq, v, k] of [['Costo directo', c.costo_directo, 'costo_directo'], ['Administración', c.administracion, 'administracion'], ['Imprevistos', c.imprevistos, 'imprevistos'], ['Utilidad', c.utilidad, 'utilidad'], ['IVA', c.iva, 'iva'], ['Total de la oferta', c.total, 'total']] as const) {
        if (v !== null) wd.addRow({ ...base, nivel: 'Componente', actividad: etq, importe: v, fuente: fuenteTexto(o.fuentes_componentes[k] ?? null) });
      }
      for (const k of o.controles) wd.addRow({ ...base, nivel: 'Control', actividad: k.control, importe: null, fuente: k.estado === 'CUADRA' ? 'cuadra' : Math.abs(k.diferencia) < 1 ? `Diferencia aritmética de $${Math.abs(k.diferencia).toFixed(2).replace('.', ',')} entre las cifras documentadas` : 'no cuadra' });
    }
  }
  wd.eachRow((r, i) => { if (i > 1) r.alignment = { wrapText: true, vertical: 'top' }; });

  const wf = wb.addWorksheet('Fuentes');
  wf.columns = [{ header: 'Fuente', width: 30 }, { header: 'Documento', width: 60 }, { header: 'Versión', width: 10 }, { header: 'Fecha de corte', width: 16 }];
  wf.getRow(1).font = { bold: true };
  for (const s of d.fuentes) wf.addRow([s.rotulo, s.documento.normalize('NFC'), s.version_id, d.fecha_corte ? fechaCorteTexto(d.fecha_corte) : '']);

  const nota = wb.addWorksheet('Cómo leerlo');
  [
    'Cada fila es un edificio. El valor, el área y el valor por m² conservan su procedencia (Contrato, Consolidado, Matriz, Presupuesto o Cotización) y su fuente.',
    'Los valores «Consolidado» son datos reportados en el consolidado de seguimiento: el estado «Contratado» no verifica un contrato firmado ni el avance un acta de terminación.',
    'El valor de un contrato que cubre varios edificios no se asigna a cada uno ni se reparte sin un desglose documentado.',
    '«Valor por m²: Reportado» es el indicador del consolidado; solo se llama «Contratado» cuando el importe contractual y el área documentada corresponden al mismo edificio.',
    'Subtotales, totales e impuestos resumen a las partidas y no se suman a ellas. Una diferencia aritmética se informa sin atribuirle una causa.',
    'Las cifras de cada etapa (cotización, presupuesto, contrato, consolidado) no son precios equivalentes por defecto.',
  ].forEach((t) => nota.addRow([t]));
  nota.getColumn(1).width = 130;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
