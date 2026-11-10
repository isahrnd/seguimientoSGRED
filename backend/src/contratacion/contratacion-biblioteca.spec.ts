import { leerHoja, valorComoDato } from './contratacion-excel';
import { normalizar, sugerir } from './contratacion-sugerencias';
import { validarImportacion } from './contratacion-importacion.validador';

jest.setTimeout(30000);

describe('sugerencias con evidencia', () => {
  const base = { edificacionesConocidas: ['ALFAMAR', 'BETAMAR'] };

  it('la carpeta aporta edificación y categoría; el nombre solo orienta la empresa', () => {
    const s = sugerir({ ...base, nombre: '4. EMPRESA UNO.pdf', ruta: '1. ALFAMAR/COTIZACIONES/4. EMPRESA UNO.pdf' });
    expect(s).toEqual(expect.arrayContaining([
      { tipo: 'EDIFICACION', valor: 'ALFAMAR', fuente_tipo: 'CARPETA', fuente_detalle: '1. ALFAMAR' },
      { tipo: 'CATEGORIA', valor: 'COTIZACIONES', fuente_tipo: 'CARPETA', fuente_detalle: 'COTIZACIONES' },
      { tipo: 'EMPRESA', valor: 'EMPRESA UNO', fuente_tipo: 'NOMBRE', fuente_detalle: '4. EMPRESA UNO.pdf' },
    ]));
    expect(s.some((x) => x.tipo === 'EXPEDIENTE')).toBe(false); // el nombre no identifica la intervención
  });

  it('un archivo suelto sin carpeta no inventa edificación', () => {
    const s = sugerir({ ...base, nombre: 'EMPRESA UNO.pdf', ruta: 'EMPRESA UNO.pdf' });
    expect(s.some((x) => x.tipo === 'EDIFICACION')).toBe(false);
  });

  it('una evaluación técnica se identifica aunque no tenga contrato', () => {
    const s = sugerir({ ...base, nombre: 'evaluacion_ATC20_Edificio X.pdf', ruta: 'X/SOPORTES TÉCNICOS/evaluacion_ATC20_Edificio X.pdf' });
    expect(s.some((x) => x.tipo === 'CATEGORIA' && x.valor === 'VISITA_SOPORTE_TECNICO')).toBe(true);
  });

  it('las menciones en el texto o en celdas conservan página u hoja y celda', () => {
    const s = sugerir({
      ...base, nombre: 'a.pdf', ruta: 'BETAMAR/a.pdf',
      paginas: [{ pagina: 2, texto: 'El predio Alfamar fue evaluado' }],
      celdas: [{ ref: 'Hoja1!B3', texto: 'Edificio Alfamar' }],
    });
    expect(s).toEqual(expect.arrayContaining([
      { tipo: 'EDIFICACION', valor: 'ALFAMAR', fuente_tipo: 'PDF_PAGINA', fuente_detalle: 'pág. 2' },
      { tipo: 'EDIFICACION', valor: 'ALFAMAR', fuente_tipo: 'XLSX_CELDA', fuente_detalle: 'Hoja1!B3' },
    ]));
  });

  it('extrae la resolución citada sin asociar un expediente', () => {
    const s = sugerir({ ...base, nombre: 'RESOLUCIÓN No. 1111.002.21.1.316 DE 2026_X.pdf', ruta: 'X/RESOLUCIÓN No. 1111.002.21.1.316 DE 2026_X.pdf' });
    expect(s).toContainEqual({ tipo: 'RESOLUCION', valor: '1111.002.21.1.316-2026', fuente_tipo: 'NOMBRE', fuente_detalle: 'RESOLUCIÓN No. 1111.002.21.1.316 DE 2026_X.pdf' });
    expect(s.some((x) => x.tipo === 'EXPEDIENTE')).toBe(false);
  });

  it('normaliza tildes y mayúsculas para buscar', () => expect(normalizar('  RESOLUCIÓN  Torre MÉTRICA ')).toBe('resolucion torre metrica'));
});

describe('vista previa segura de hojas de cálculo', () => {
  async function libro() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Datos');
    ws.addRow(['Concepto', 'Valor']);
    ws.addRow(['Demolición', 1500]);
    ws.getCell('B3').value = { formula: 'B2*2', result: 3000 };
    ws.getCell('A4').value = { text: 'ver más', hyperlink: 'https://externo.invalid/x' };
    ws.getCell('A5').value = { formula: 'HYPERLINK("https://externo.invalid","x")' }; // sin resultado almacenado
    wb.addWorksheet('Otra').addRow(['x']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('muestra celdas como datos: fórmula = resultado almacenado, enlace = solo texto', async () => {
    const r = await leerHoja(await libro(), 0);
    expect(r.hojas.map((h: any) => h.nombre)).toEqual(['Datos', 'Otra']);
    const f = r.hoja!.filas;
    expect(f[1]).toEqual(['Demolición', 1500]);
    expect(f[2][1]).toBe(3000);
    expect(f[3][0]).toBe('ver más');
    expect(JSON.stringify(r)).not.toContain('externo.invalid');
    expect(f[4][0]).toBeNull(); // fórmula sin resultado: no se evalúa
  });

  it('una hoja inexistente devuelve null y los valores complejos no ejecutan nada', async () => {
    expect((await leerHoja(await libro(), 9)).hoja).toBeNull();
    expect(valorComoDato({ formula: 'A1+1' })).toBeNull();
    expect(valorComoDato({ richText: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
  });

  it('limita filas y columnas', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('G');
    for (let i = 0; i < 300; i++) ws.addRow(Array.from({ length: 40 }, (_, j) => `${i}-${j}`));
    const r = await leerHoja(Buffer.from(await wb.xlsx.writeBuffer()), 0);
    expect(r.hoja!.filas.length).toBe(200);
    expect(r.hoja!.filas[0].length).toBe(30);
    expect(r.hoja!.truncado).toBe(true);
  });
});

describe('confirmaciones documentales en la importación', () => {
  const md5 = 'a'.repeat(32);
  it('acepta una confirmación válida y rechaza tipos o categorías inválidos', () => {
    expect(validarImportacion({ version: 1, documentos: [{ documento: md5, confirmaciones: [{ tipo: 'EDIFICACION', valor: 'ALFAMAR' }] }] }).errores).toEqual([]);
    expect(validarImportacion({ version: 1, documentos: [{ documento: md5, confirmaciones: [{ tipo: 'CATEGORIA', valor: 'INVENTADA' }] }] }).errores.length).toBe(1);
    expect(validarImportacion({ version: 1, documentos: [{ documento: md5, confirmaciones: [{ tipo: 'IMPORTE', valor: '5' }] }] }).errores.length).toBe(1);
    expect(validarImportacion({ version: 1, documentos: [{ documento: md5, confirmaciones: [{ tipo: 'EXPEDIENTE', valor: 'EMPRESA UNO' }] }] }).errores.length).toBe(1);
  });
});
