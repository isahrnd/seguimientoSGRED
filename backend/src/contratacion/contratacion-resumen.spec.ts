import * as ExcelJS from 'exceljs';
import { areaDocumentadaM2, filaResumen, fuenteTexto } from './contratacion-resumen';
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
  it('el precio por m² exige un edificio y un área; no aplica a grúas', () => {
    const lineas = [{ unidad: 'M2', cantidad: 50 }, { unidad: 'M2', cantidad: 50 }, { unidad: 'M2', cantidad: 20 }];
    expect(areaDocumentadaM2(lineas)).toBe(50);
    const ok = filaResumen(base({ cotizaciones: [{ lineas }], valores: [{ tipo: 'PRESUPUESTO_OFICIAL', importe: 5000, soporte: null }] }));
    expect(ok.precio_m2).toBe(100);
    expect(filaResumen(base()).nota_m2).toBe('Área pendiente');
    const dos = base({ cotizaciones: [{ lineas }] }); dos.expediente.edificaciones = ['A', 'B'];
    expect(filaResumen(dos).precio_m2).toBeNull();
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
