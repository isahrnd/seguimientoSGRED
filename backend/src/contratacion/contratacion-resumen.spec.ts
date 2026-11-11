import * as ExcelJS from 'exceljs';
import { filaResumen, fuenteTexto } from './contratacion-resumen';
import { construirLibroResumen } from './contratacion-resumen-excel';

const base = (o: any = {}) => ({
  expediente: { proceso: 'P-630', numero_contrato: null, intervencion: 'Demolición', edificaciones: ['Edificio A'], tipo_intervencion: 'DEMOLICION', estado: 'PENDIENTE_SOPORTE', pendientes: ['Contrato o acto de adjudicación'] },
  contratacion: { contratos: [] }, ejecucion: { valores: [] }, valores: [], cotizaciones: [], comparacion: { seleccion: { oferta: null } },
  matriz: { valor_reportado: { importe: 123456789.12, coincide_con_contrato: false, soporte: { documento: 'matriz.xlsx', hoja: 'COMPRAS', celda: 'F6' } } }, ...o,
});

describe('resumen por contrato', () => {
  it('cita la fuente con hoja y celda o con página', () => {
    expect(fuenteTexto({ documento: 'matriz.xlsx', hoja: 'COMPRAS', celda: 'F6' })).toBe('matriz.xlsx, hoja COMPRAS, celda F6');
    expect(fuenteTexto({ documento: 'c.pdf', pagina: 3 })).toBe('c.pdf, p. 3');
    expect(fuenteTexto(null)).toBe('');
  });
  it('sin contrato, la matriz queda como reportada y el contrato pendiente de vincular', () => {
    const f = filaResumen(base());
    expect(f.valor_matriz).toBe(123456789.12);
    expect(f.fuente_matriz).toContain('celda F6');
    expect(f.valor_contrato).toBeNull();
    expect(f.observacion).toContain('Contrato pendiente de vincular');
  });
  it('misma cifra en matriz y contrato cuenta una vez y se informa', () => {
    const f = filaResumen(base({ contratacion: { contratos: [{ valor: 100, soporte: { documento: 'c.pdf', pagina: 2 } }] }, matriz: { valor_reportado: { importe: 100, coincide_con_contrato: true, soporte: null } } }));
    expect(f.valor_contrato).toBe(100);
    expect(f.observacion).toContain('cuenta una sola vez');
  });
  it('el precio por m² usa solo una superficie documentada; las partidas en m² no cuentan', () => {
    const lineas = [{ unidad: 'M2', cantidad: 50 }, { unidad: 'M2', cantidad: 50 }, { unidad: 'M2', cantidad: 20 }];
    const oficial = [{ tipo: 'PRESUPUESTO_OFICIAL', importe: 5000, soporte: null }];
    const sinArea = filaResumen(base({ cotizaciones: [{ lineas }], valores: oficial, area_precio: { estado: 'PENDIENTE', valor: null, motivo: 'Superficie no documentada para este edificio.' } }));
    expect(sinArea.precio_m2).toBeNull();
    expect(sinArea.area_m2).toBeNull();
    expect(sinArea.nota_m2).toBe('Superficie no documentada para este edificio.');
    const ok = filaResumen(base({ valores: oficial, area_precio: { estado: 'DOCUMENTADA', valor: 50, tipo: 'CONSTRUIDA', cita: 'área construida de 50 m2', soporte: { documento: 'ficha.pdf', pagina: 2 }, motivo: null } }));
    expect(ok.precio_m2).toBe(100);
    expect(ok.nota_m2).toContain('ficha.pdf, p. 2');
    const conflicto = filaResumen(base({ valores: oficial, area_precio: { estado: 'CONFLICTO', valor: null, motivo: 'Superficies distintas' } }));
    expect(conflicto.precio_m2).toBeNull();
    const g = base(); g.expediente.tipo_intervencion = 'IZAJE_GRUAS';
    expect(filaResumen(g).nota_m2).toContain('No aplica');
  });
  it('el libro conserva los centavos y las fuentes', async () => {
    const buf = await construirLibroResumen([filaResumen(base())]);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('Resumen por contrato')!;
    expect(ws.getRow(2).getCell(7).value).toBe(123456789.12);
    expect(String(ws.getRow(2).getCell(8).value)).toContain('F6');
  });
});

describe('exportación de la lectura de documentos', () => {
  it('lista cada fila con su nivel y fuente, y no suma subtotales ni totales a las partidas', async () => {
    const lectura = [{
      documento: 'oferta.pdf', origen: 'ASISTIDA', campos: [{ campo: 'edificio', valor: 'Edificio Alfa', pagina: 1, cita: 'x', fuente: null }], no_encontrados: [{ campo: 'proceso', motivo: 'no consta' }],
      partidas: [
        { nivel: 'PARTIDA', edificio: 'Edificio Alfa', alcance: 'Alt 1', importe: 100, unidad: 'GLOBAL', pagina: 5, relacion: 'EXPLICITA', coincidencia: null },
        { nivel: 'TOTAL', edificio: null, alcance: 'Alt 1 - Total', importe: 100, unidad: 'GLOBAL', pagina: 5, relacion: 'PENDIENTE_REVISION', coincidencia: null },
      ],
      suma_solo_partidas: 100, controles_de_suma: [{ grupo: 'Alt 1', suma_partidas: 100, total_declarado: 100, estado: 'CUADRA', diferencia: 0 }], controles_aritmeticos: [],
    }];
    const buf = await construirLibroResumen([], lectura);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('Lectura de documentos')!;
    expect(ws.getRow(2).getCell(5).value).toBe('Partida');
    expect(ws.getRow(3).getCell(5).value).toBe('Total');
    expect(ws.getRow(2).getCell(8).value).toBe('p. 5');
    const control = ws.getRow(4);
    expect(control.getCell(5).value).toBe('Control');
    expect(control.getCell(6).value).toBe(100); // solo partidas: 100, no 200
    const datos = wb.getWorksheet('Datos extraídos')!;
    expect(String(datos.getRow(3).getCell(6).value)).toMatch(/Dato no encontrado por el extractor/);
  });
});
