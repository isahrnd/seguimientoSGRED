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
    expect(f.observacion).toContain('Documentación contractual por incorporar');
    expect(f.estado).toBe('Documentación contractual por incorporar'); // el estado interno sigue siendo PENDIENTE_SOPORTE
  });
  it('la comparación de precios se presenta con la etiqueta institucional y su detalle, en la hoja del libro', async () => {
    const d = base({ analisis_precios: { presentacion: { etiqueta: 'Documentación contractual por incorporar', detalle: 'Se cuenta con un estudio de mercado. La comparación se completará al incorporar la información contractual correspondiente.', tono: 'INFORMATIVO' } } });
    const f = filaResumen(d);
    expect(f.comparacion_precios).toBe('Documentación contractual por incorporar. Se cuenta con un estudio de mercado. La comparación se completará al incorporar la información contractual correspondiente.');
    expect(filaResumen(base()).comparacion_precios).toBe('');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await construirLibroResumen([f])) as any);
    const ws = wb.getWorksheet('Resumen por contrato')!;
    const encabezados: string[] = []; ws.getRow(1).eachCell((c) => encabezados.push(String(c.value)));
    expect(encabezados).toContain('Comparación de precios');
    const col = encabezados.indexOf('Comparación de precios') + 1;
    expect(String(ws.getRow(2).getCell(col).value)).toMatch(/^Documentación contractual por incorporar\./);
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
      documento: 'oferta.pdf', version_id: 7, origen: 'ASISTIDA', campos: [{ campo: 'edificio', valor: 'Edificio Alfa', pagina: 1, cita: 'x', fuente: null }], no_encontrados: [{ campo: 'proceso', motivo: 'no consta' }],
      partidas: [
        { nivel: 'PARTIDA', edificio: 'Edificio Alfa', alcance: 'Alt 1', importe: 100, unidad: 'GLOBAL', pagina: 5, relacion: 'EXPLICITA', coincidencia: null },
        { nivel: 'TOTAL', edificio: null, alcance: 'Alt 1 - Total', importe: 100, unidad: 'GLOBAL', pagina: 5, relacion: 'PENDIENTE_REVISION', coincidencia: null },
      ],
      suma_solo_partidas: 100, controles_de_suma: [{ grupo: 'Alt 1', suma_partidas: 100, total_declarado: 100, estado: 'CUADRA', diferencia: 0 }], controles_aritmeticos: [],
    }];
    const buf = await construirLibroResumen([], lectura);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('Lectura de documentos')!;
    const col = (n: string) => { let i = 0; ws.getRow(1).eachCell((c, k) => { if (c.value === n) i = k; }); return i; };
    expect(ws.getRow(2).getCell(col('Nivel')).value).toBe('Partida');
    expect(ws.getRow(3).getCell(col('Nivel')).value).toBe('Total');
    expect(ws.getRow(2).getCell(col('Fuente')).value).toBe('p. 5');
    expect(ws.getRow(2).getCell(col('Unidad')).value).toBe('GLOBAL');
    const control = ws.getRow(4);
    expect(control.getCell(col('Nivel')).value).toBe('Control');
    expect(control.getCell(col('Importe')).value).toBe(100); // solo partidas: 100, no 200
    const datos = wb.getWorksheet('Datos extraídos')!;
    expect(String(datos.getRow(3).getCell(6).value)).toMatch(/Dato no encontrado por el extractor/);
  });

  it('conserva cantidad, precio unitario, unidad y nivel; el contenido adicional queda rotulado y sin fila de suma', async () => {
    const lectura = [
      { documento: 'hoja.xlsx', version_id: 8, origen: 'HOJA_DE_CALCULO', campos: [], no_encontrados: [], partidas: [{ nivel: 'PARTIDA', alcance: 'Excavación', cantidad: 12, precio_unitario: 50, importe: 600, unidad: 'M3', fuente: 'Hoja RESUMEN, celda H30', coincidencia: null }], suma_solo_partidas: 600, controles_de_suma: [], controles_aritmeticos: [] },
      { documento: 'hoja.xlsx — hoja RESUMEN (2)', version_id: 8, origen: 'HOJA_DE_CALCULO', excluida_de_indicadores: true, correspondencia_pendiente: { proyecto: { nombre: 'OBRAS CIVILES PARA CALDERA', celda: 'D9', fecha: '2025-01-31' }, senales: ['el nombre del proyecto no comparte palabras con el de la hoja RESUMEN'] }, campos: [], no_encontrados: [], partidas: [{ nivel: 'PARTIDA', alcance: 'Otra', cantidad: 2, precio_unitario: 5, importe: 10, unidad: 'UND', fuente: 'Hoja RESUMEN (2), celda H9', coincidencia: null }], suma_solo_partidas: null, controles_de_suma: [], controles_aritmeticos: [] },
    ];
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await construirLibroResumen([], lectura)) as any);
    const ws = wb.getWorksheet('Lectura de documentos')!;
    const col = (n: string) => { let i = 0; ws.getRow(1).eachCell((c, k) => { if (c.value === n) i = k; }); return i; };
    expect(ws.getRow(2).getCell(col('Cantidad')).value).toBe(12);
    expect(ws.getRow(2).getCell(col('Precio unitario')).value).toBe(50);
    expect(ws.getRow(2).getCell(col('Unidad')).value).toBe('M3');
    expect(ws.getRow(2).getCell(col('Importe')).value).toBe(600);
    // El contenido adicional NO está en la lectura principal: tiene su propia hoja, con su procedencia.
    expect(ws.rowCount).toBe(3); // encabezado, la partida y su control
    const filasMain: string[] = []; ws.eachRow((r) => filasMain.push(String(r.getCell(1).value)));
    expect(filasMain.join('|')).not.toMatch(/RESUMEN (2)/);
    const wa = wb.getWorksheet('Contenido adicional')!;
    const cola = (n: string) => { let i = 0; wa.getRow(1).eachCell((c, k) => { if (c.value === n) i = k; }); return i; };
    expect(wa.getRow(2).getCell(1).value).toBe('hoja.xlsx — hoja RESUMEN (2) (v8)');
    expect(wa.getRow(2).getCell(cola('Estado de revisión')).value).toMatch(/Contenido adicional pendiente de revisión/);
    expect(wa.getRow(2).getCell(cola('Cantidad')).value).toBe(2);
    expect(wa.getRow(2).getCell(cola('Fuente')).value).toBe('Hoja RESUMEN (2), celda H9');
    expect(wa.getRow(2).getCell(cola('Proyecto citado en la hoja (celda)')).value).toMatch(/CALDERA/);
    expect(String(wa.getRow(2).getCell(cola('Señales para revisión')).value)).toMatch(/no comparte palabras/);
  });

  it('un documento con solo totales no muestra una suma de partidas en cero: dice que el desglose está pendiente', async () => {
    const lectura = [{ documento: 'solo-total.pdf', version_id: 9, origen: 'ASISTIDA', campos: [], no_encontrados: [], partidas: [{ nivel: 'TOTAL', alcance: 'Total oferta', importe: 500, unidad: 'GLOBAL', pagina: 8, relacion: 'PENDIENTE_REVISION', coincidencia: null }], suma_solo_partidas: 0, controles_de_suma: [], controles_aritmeticos: [] }];
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await construirLibroResumen([], lectura)) as any);
    const ws = wb.getWorksheet('Lectura de documentos')!;
    const texto: string[] = []; ws.eachRow((r) => texto.push(String(r.getCell(4).value)));
    expect(texto.join('|')).toMatch(/Se identificaron totales; desglose pendiente de verificación/);
    expect(texto.join('|')).not.toMatch(/Suma solo de partidas/);
  });

  it('una diferencia menor a un peso se presenta como diferencia aritmética entre las cifras documentadas, sin atribuirle causa ni ajustar valores', async () => {
    const lectura = [{ documento: 'oferta.pdf', version_id: 3, origen: 'ASISTIDA', campos: [], no_encontrados: [], partidas: [{ nivel: 'PARTIDA', alcance: 'Ítem', importe: 1000, unidad: 'GLOBAL', pagina: 1 }], suma_solo_partidas: 1000, controles_de_suma: [],
      controles_aritmeticos: [{ control: 'Ítems + AIU = total antes de IVA', calculado: 1500.4, declarado: 1500, estado: 'NO_CUADRA', diferencia: -0.4 }, { control: 'Otro control', calculado: 10, declarado: 20, estado: 'NO_CUADRA', diferencia: 10 }] }];
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await construirLibroResumen([], lectura)) as any);
    const ws = wb.getWorksheet('Lectura de documentos')!;
    const textos: string[] = []; ws.eachRow((r) => textos.push(r.values ? (r.values as any[]).join(' ') : ''));
    const todo = textos.join('\n');
    expect(todo).toMatch(/Diferencia aritmética de \$0,40 entre las cifras documentadas/);
    expect(todo).toMatch(/Otro control: no cuadra/);
    expect(todo).not.toMatch(/redondeo/i);
  });
});
