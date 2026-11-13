import * as ExcelJS from 'exceljs';
import { informeEdificio, informeGeneral } from './contratacion-informe-pdf';
import { construirLibroPrecios } from './contratacion-precios-excel';
import { construirFila, cop, EntradaFila, FilaEdificio, OfertaEdificio } from './contratacion-vista-precios';

// Datos SINTÉTICOS. Se comprueba que pantalla (la vista), Excel y PDF muestran las mismas cifras, porque los tres salen de la misma fila.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
const F = (documento: string, extra: any = {}) => ({ version_id: 1, documento, pagina: null, hoja: null, celda: null, ...extra });

const oferta = (empresa: string, cd: number, total: number): OfertaEdificio => ({
  empresa, documento: `${empresa}.pdf`, version_id: 2, etapa: 'COTIZACION', fecha: '2026-09-18', referencia: null, nivel: 'COSTO_DIRECTO',
  items: [{ actividad: 'Demolición total', unidad: 'Global', cantidad: 1, precio_unitario: cd, subtotal: cd, nivel: 'PARTIDA', fuente: F(`${empresa}.pdf`, { pagina: 9 }) }],
  componentes: { costo_directo: cd, administracion: cd * 0.15, imprevistos: cd * 0.03, utilidad: cd * 0.05, iva: 9500, total }, fuentes_componentes: { costo_directo: F(`${empresa}.pdf`, { pagina: 9 }), total: F(`${empresa}.pdf`, { pagina: 9 }) },
  alcance: null, oferta_conjunta: null, relacion: 'Documento vinculado únicamente a este edificio', controles: [{ control: 'Total antes de IVA + IVA = total', estado: 'NO_CUADRA', diferencia: -0.4 }],
});

const entrada = (o: Partial<EntradaFila>): EntradaFila => ({ edificio: { id: 1, nombre: 'Edificio Alfa', direccion: 'Carrera 1 # 2-3' }, consolidado: null, procesos: [], area_documentada: null, ofertas: [], contrato_por_vincular: false, analisis_sector: false, ...o });
const consolidado = { id: 1, nombre: 'Edificio Alfa', direccion: null, estado: 'CONTRATADO', avance: 'COMPLETADO', valor: 123_456_789, area_m2: 400.5, valor_m2: 308_272.26, responsable: 'EMPRESA A', formula_valor: null, fecha_corte: '2026-11-11', vinculo: 'NOMBRE_EXACTO',
  fuentes: { valor: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'E2' }), area_m2: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'F2' }), valor_m2: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'G2' }), responsable: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'H2' }), estado: F('consolidado.xlsx', { hoja: 'Hoja1', celda: 'C2' }) } };

const filas = (): FilaEdificio[] => [
  construirFila(entrada({ consolidado, ofertas: [oferta('EMPRESA UNO', 1000, 1239.5), oferta('EMPRESA DOS', 1200, 1500)], procesos: [{ id: 3, proceso: 'P-1', numero_contrato: null, intervencion: null, edificios_del_proceso: 1, contratos: [], reportado_matriz: { importe: 123_456_789.26, soporte: F('matriz.xlsx', { hoja: 'COMPRAS', celda: 'F6' }) }, presupuesto_oficial: null }] })),
  construirFila(entrada({ edificio: { id: 2, nombre: 'Edificio Beta', direccion: null }, procesos: [{ id: 4, proceso: 'P-2', numero_contrato: 'C-2', intervencion: null, edificios_del_proceso: 3, contratos: [{ valor: 900_000_000, tipo_acto: 'Contrato', numero: 'C-2', contratista: 'EMPRESA C', soporte: F('contrato.pdf', { pagina: 1 }) }], reportado_matriz: null, presupuesto_oficial: null }] })),
];

async function textoPdf(b: Buffer): Promise<string> { const r = await pdfParse(b); return String(r.text).replace(/\s+/g, ' '); }

describe('pantalla, Excel y PDF muestran las mismas cifras (misma fila de la vista)', () => {
  it('Excel: valor, área, valor por m², procedencia, fuente y diferencias coinciden con la fila', async () => {
    const f = filas();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await construirLibroPrecios({ fecha_corte: '2026-11-11', generado_en: new Date().toISOString(), filas: f, fuentes: [{ rotulo: 'Consolidado de seguimiento', documento: 'consolidado.xlsx', version_id: 9 }] })) as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Precios por edificio', 'Desglose por oferta', 'Fuentes', 'Cómo leerlo']);
    const ws = wb.getWorksheet('Precios por edificio')!;
    const h: Record<string, number> = {}; ws.getRow(1).eachCell((c, k) => { h[String(c.value)] = k; });
    const celda = (r: number, n: string) => ws.getRow(r).getCell(h[n]).value;
    expect(celda(2, 'Edificio')).toBe('Edificio Alfa');
    expect(celda(2, 'Valor')).toBe(f[0].valor!.valor);
    expect(celda(2, 'Procedencia del valor')).toBe('Consolidado');
    expect(String(celda(2, 'Fuente del valor'))).toMatch(/Según consolidado del 11\/11\/2026\. consolidado\.xlsx, hoja Hoja1, celda E2/);
    expect(celda(2, 'Área (m²)')).toBe(400.5);
    expect(celda(2, 'Valor por m²')).toBe(308_272.26);
    expect(celda(2, 'Valor por m²: tipo')).toBe('Reportado (consolidado)');
    expect(String(celda(2, 'Diferencias entre fuentes'))).toContain('diferencia de $0,26');
    // contrato conjunto: no se asigna al edificio
    expect(celda(3, 'Valor')).toBeNull();
    expect(celda(3, 'Valor del contrato conjunto')).toBe(900_000_000);
    expect(celda(3, 'Edificaciones del contrato')).toBe(3);
    // desglose: cada importe de la fila, con su fuente y sin sumar niveles
    const wd = wb.getWorksheet('Desglose por oferta')!;
    const hd: Record<string, number> = {}; wd.getRow(1).eachCell((c, k) => { hd[String(c.value)] = k; });
    const filasD: any[] = []; wd.eachRow((r, i) => { if (i > 1) filasD.push({ empresa: r.getCell(hd['Empresa']).value, nivel: r.getCell(hd['Nivel']).value, act: r.getCell(hd['Actividad / componente']).value, imp: r.getCell(hd['Subtotal / valor']).value, fuente: r.getCell(hd['Fuente']).value }); });
    expect(filasD.find((x) => x.empresa === 'EMPRESA UNO' && x.act === 'Demolición total')).toMatchObject({ nivel: 'Actividad', imp: 1000, fuente: 'EMPRESA UNO.pdf, p. 9' });
    expect(filasD.find((x) => x.empresa === 'EMPRESA UNO' && x.act === 'Total de la oferta')).toMatchObject({ nivel: 'Componente', imp: 1239.5 });
    expect(filasD.find((x) => x.nivel === 'Control')!.fuente).toBe('Diferencia aritmética de $0,40 entre las cifras documentadas');
  });

  it('PDF general: texto seleccionable con las mismas cifras, encabezado y numeración', async () => {
    const f = filas();
    const t = await textoPdf(await informeGeneral({ fecha_corte: '2026-11-11', generado_en: new Date().toISOString(), filas: f, fuentes: [{ rotulo: 'Consolidado de seguimiento', documento: 'consolidado.xlsx', version_id: 9 }] }));
    expect(t).toContain('Análisis de precios por edificio');
    expect(t).toContain('Edificio Alfa');
    expect(t).toContain(cop(f[0].valor!.valor));
    expect(t).toContain('400,5 m²');
    expect(t).toContain(cop(f[0].valor_m2!.valor));
    expect(t).toContain('Contrato conjunto');
    expect(t).toContain(cop(900_000_000));
    expect(t).toMatch(/Página 1 de \d/);
    expect(t).toContain('11/11/2026');
    expect(t).toContain('no se asigna a cada edificio');
  });

  it('PDF de un edificio: cuatro datos clave, desglose por actividad, comparación por nivel y referencias documentales', async () => {
    const f = filas()[0];
    const t = await textoPdf(await informeEdificio({
      fila: f, fecha_corte: '2026-11-11', generado_en: new Date().toISOString(), anexo: true,
      documentos: [{ grupo: 'Cotizaciones', nombre: 'EMPRESA UNO.pdf', version_id: 2, formato: 'PDF', evidencias: [{ fuente_tipo: 'PDF_PAGINA', detalle: 'pág. 2' }] }],
    }));
    for (const x of ['Edificio Alfa', 'VALOR REPORTADO', cop(123_456_789), '400,5 m²', cop(308_272.26), 'EMPRESA A', 'A. Desglose de precios', 'Demolición total', cop(1000), 'B. Comparación', 'EMPRESA DOS', cop(1200), 'C. Documentos de respaldo', 'hoja Hoja1, celda E2', 'Anexo documental', 'Contenido del documento']) expect(t).toContain(x);
    expect(t).toContain('diferencia aritmética de $0,40 entre las cifras documentadas');
    expect(t).toMatch(/Página 1 de \d/);
    // una comparación solo entre cifras del mismo nivel
    expect(t).toContain('Costo directo');
  });

  it('un PDF largo repite el encabezado de la tabla en cada página y numera todas las páginas', async () => {
    const muchas = Array.from({ length: 70 }, (_, i) => construirFila(entrada({ edificio: { id: 100 + i, nombre: `Edificio número ${i + 1}`, direccion: null }, consolidado: { ...consolidado, id: 100 + i, valor: 1_000_000 + i } })));
    const buf = await informeGeneral({ fecha_corte: '2026-11-11', generado_en: new Date().toISOString(), filas: muchas, fuentes: [] });
    const t = await textoPdf(buf);
    const paginas = Number(/Página \d+ de (\d+)/.exec(t)![1]);
    expect(paginas).toBeGreaterThan(1);
    // el encabezado de la tabla se repite en cada página que continúa la tabla (el texto extraído une las celdas sin espacios)
    expect((t.match(/EdificioResponsableValorProcedencia/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(t).toContain(`Página ${paginas} de ${paginas}`);
  });
});
