import { analizarPrecios, desgloseContratado, ofertasVigentes, tipoIntervencion } from './contratacion-precios';

/** Datos FICTICIOS: no corresponden a ningún proceso real. */
const sop = { documento_id: 1, version_id: 1, documento: 'doc ficticio', pagina: 1, hoja: null, celda: null };
const of = (proveedor: string, valor: number | null, grupo = proveedor, revision = 1) => ({ proveedor, grupo_oferta: grupo, revision, valor, soporte: sop });
const contrato = (valor: number, oferta = 'A', tipo_acto = 'CONTRATO') => ({ valor, tipo_acto, numero: 'C-1', oferta, soporte: sop });
const base = (extra: any = {}) => ({
  contratos: [contrato(1000)],
  ofertas: [of('A', 1000), of('B', 1100), of('C', 900)],
  presupuestoOficial: null,
  referenciasExternas: [],
  alcance: { comparables: true, hay_diferencias: false, diferencias: [] },
  seleccion: { oferta: 'A', justificada: false },
  ejecutado: [],
  partidas: { comparadas: 0, total: 0 },
  ...extra,
});

describe('análisis de precios', () => {
  it('con contrato y tres ofertas de alcance equivalente calcula diferencia en COP y % frente a cada referencia', () => {
    const r = analizarPrecios(base());
    expect(r.resultado).toBe('DENTRO_DEL_RANGO');
    const b = r.referencias.find((x) => x.proveedor === 'B')!;
    expect(b).toMatchObject({ valor: 1100, diferencia_cop: -100, diferencia_pct: -9.09, comparable: true, independiente: true });
    const c = r.referencias.find((x) => x.proveedor === 'C')!;
    expect(c).toMatchObject({ diferencia_cop: 100, diferencia_pct: 11.11 });
    expect(r.rango).toEqual({ min: 900, max: 1100, referencias: 2 });
    expect(r.resumen).toMatch(/dentro del rango/);
  });

  it('un precio superior a las referencias se muestra con la misma visibilidad y señala si falta justificación', () => {
    const r = analizarPrecios(base({ contratos: [contrato(1500)] }));
    expect(r.resultado).toBe('POR_ENCIMA_DEL_RANGO');
    expect(r.resumen).toMatch(/supera/);
    expect(r.resumen).toMatch(/No hay una justificación documentada/);
    expect(analizarPrecios(base({ contratos: [contrato(1500)], seleccion: { oferta: 'A', justificada: true } })).resumen).toMatch(/justificación documentada de la selección/);
  });

  it('un precio inferior también se muestra', () => {
    expect(analizarPrecios(base({ contratos: [contrato(500)] })).resultado).toBe('POR_DEBAJO_DEL_RANGO');
  });

  it('una sola oferta y ninguna referencia: evidencia insuficiente, sin porcentajes', () => {
    const r = analizarPrecios(base({ ofertas: [of('A', 1000)] }));
    expect(r.resultado).toBe('EVIDENCIA_INSUFICIENTE');
    expect(r.resumen).toMatch(/Comparación de precios por completar/);
    expect(r.presentacion).toMatchObject({ etiqueta: 'Comparación de precios por completar', tono: 'INFORMATIVO' });
    expect(r.resumen).not.toMatch(/sobrecosto|sin sobrecostos/i);
    expect(r.referencias.every((x) => x.diferencia_pct === null)).toBe(true);
  });

  it('las versiones de una misma oferta no cuentan como competidores distintos', () => {
    const v = ofertasVigentes([of('A', 900, 'g1', 1), of('A', 1000, 'g1', 2), of('B', 1100, 'g2', 1)]);
    expect(v.map((o) => `${o.proveedor}:${o.valor}`).sort()).toEqual(['A:1000', 'B:1100']);
    // Dos revisiones de A y una de B: solo hay una referencia independiente frente a la oferta contratada A.
    const r = analizarPrecios(base({ ofertas: [of('A', 900, 'g1', 1), of('A', 1000, 'g1', 2), of('B', 1100, 'g2', 1)] }));
    expect(r.resultado).toBe('EVIDENCIA_INSUFICIENTE');
  });

  it('sin contrato o acto soportado no se afirma nada y se pide el documento', () => {
    const r = analizarPrecios(base({ contratos: [] }));
    expect(r.resultado).toBe('SIN_CONTRATO_SOPORTADO');
    expect(r.contratado.sustentado).toBe(false);
    expect(r.pendientes.join(' ')).toMatch(/Contrato, acta de adjudicación/);
  });

  it('si el alcance de las ofertas no es equivalente no se calculan diferencias', () => {
    const r = analizarPrecios(base({ alcance: { comparables: true, hay_diferencias: true, diferencias: [{ concepto: 'Transporte de materiales' }] } }));
    expect(r.resultado).toBe('ALCANCE_NO_EQUIVALENTE');
    expect(r.referencias.filter((x) => !x.es_la_seleccionada).every((x) => x.diferencia_pct === null)).toBe(true);
    expect(r.pendientes.join(' ')).toMatch(/diferencias de alcance/);
  });

  it('el presupuesto oficial construido desde la misma oferta es comparación presupuestal, no referencia independiente', () => {
    const r = analizarPrecios(base({ ofertas: [of('A', 1000)], presupuestoOficial: { importe: 1000, soporte: sop } }));
    const p = r.referencias.find((x) => x.tipo === 'PRESUPUESTO_OFICIAL')!;
    expect(p.independiente).toBe(false);
    expect(p.motivo).toMatch(/comparación presupuestal/);
    expect(p).toMatchObject({ diferencia_cop: 0, diferencia_pct: 0 });
    expect(r.resultado).toBe('EVIDENCIA_INSUFICIENTE'); // el presupuesto no cuenta como referencia de mercado
  });

  it('un valor global de otro contrato no se compara con lo contratado', () => {
    const r = analizarPrecios(base({ ofertas: [of('A', 1000)], referenciasExternas: [{ entidad: 'Otra entidad', objeto: 'Demolición', valor: 5000, equivalente: false, motivo_no_comparable: null, soporte: sop }] }));
    const ext = r.referencias.find((x) => x.tipo === 'REFERENCIA_EXTERNA')!;
    expect(ext).toMatchObject({ comparable: false, diferencia_pct: null });
    expect(ext.motivo).toMatch(/equivalencia/);
  });

  it('una referencia que no es positiva no genera porcentaje', () => {
    const r = analizarPrecios(base({ ofertas: [of('A', 1000), of('B', 0), of('C', 900)] }));
    expect(r.referencias.find((x) => x.proveedor === 'B')).toMatchObject({ diferencia_pct: null });
  });

  it('separa valor inicial, modificaciones y valor actualizado', () => {
    const d = desgloseContratado([contrato(1000), contrato(200, 'A', 'Adición No. 1')]);
    expect(d).toMatchObject({ valor_inicial: 1000, modificaciones: 200, valor_actualizado: 1200 });
    // El contraste usa el valor inicial; la modificación se muestra aparte.
    const r = analizarPrecios(base({ contratos: [contrato(1000), contrato(200, 'A', 'Adición No. 1')] }));
    expect(r.contratado.valor_actualizado).toBe(1200);
    expect(r.referencias.find((x) => x.proveedor === 'B')!.diferencia_cop).toBe(-100);
  });

  it('ejecutado respaldado frente a contratado se informa sin presumir que es precio unitario', () => {
    const r = analizarPrecios(base({ ejecutado: [{ importe: 950, respaldado: true, soporte: sop }] }));
    expect(r.ejecutado_vs_contratado).toMatchObject({ ejecutado: 950, diferencia_cop: -50 });
    expect(r.ejecutado_vs_contratado!.nota).toMatch(/cantidades o alcance/);
  });

  it('la cobertura parcial de partidas no se extiende al contrato completo', () => {
    expect(analizarPrecios(base({ partidas: { comparadas: 1, total: 3 } })).cobertura.aviso).toMatch(/no se extiende/);
  });
});

describe('tipo de intervención', () => {
  it.each([
    ['Alquiler de grúas para izaje', 'IZAJE_GRUAS'],
    ['Demolición de edificio', 'DEMOLICION'],
    ['Retiro de RCD', 'DEMOLICION'],
    ['Interventoría', 'OTRA'],
  ])('%s => %s', (t, esperado) => expect(tipoIntervencion(t)).toBe(esperado));
});

import { presentacionPrecios, DETALLE_ESTUDIO_MERCADO } from './contratacion-precios';
describe('presentación institucional del resultado', () => {
  it('sin contrato: «Documentación contractual por incorporar», sin mencionar un estudio de mercado que no está identificado', () => {
    const r = analizarPrecios(base({ contratos: [] }));
    expect(r.resultado).toBe('SIN_CONTRATO_SOPORTADO'); // el estado interno no cambia
    expect(r.presentacion).toEqual({ etiqueta: 'Documentación contractual por incorporar', detalle: null, tono: 'INFORMATIVO' });
    expect(r.resumen).not.toMatch(/estudio de mercado/i);
  });
  it('sin contrato y con estudio de mercado identificado: añade el detalle indicado', () => {
    const r = analizarPrecios(base({ contratos: [], contexto: { estudio_mercado_identificado: true } }));
    expect(r.presentacion.detalle).toBe(DETALLE_ESTUDIO_MERCADO);
    expect(r.presentacion.detalle).toBe('Se cuenta con un estudio de mercado. La comparación se completará al incorporar la información contractual correspondiente.');
  });
  it('contrato cargado pero sin relacionar: «Documento contractual por vincular»', () => {
    const r = analizarPrecios(base({ contratos: [], contexto: { contrato_por_vincular: true } }));
    expect(r.presentacion.etiqueta).toBe('Documento contractual por vincular');
    expect(r.resumen).toMatch(/falta vincularlo/);
    expect(r.pendientes).toContain('Vincular al proceso el documento contractual ya cargado');
  });
  it('el estudio de mercado solo se menciona cuando falta el contrato (no en otros estados)', () => {
    expect(presentacionPrecios('EVIDENCIA_INSUFICIENTE', { estudio_mercado_identificado: true }).detalle).toBeNull();
    expect(presentacionPrecios('POR_ENCIMA_DEL_RANGO', { estudio_mercado_identificado: true }).detalle).toBeNull();
  });
  it('solo lo que requiere atención usa el tono de atención; un trámite pendiente es informativo', () => {
    expect(presentacionPrecios('SIN_CONTRATO_SOPORTADO').tono).toBe('INFORMATIVO');
    expect(presentacionPrecios('EVIDENCIA_INSUFICIENTE').tono).toBe('INFORMATIVO');
    expect(presentacionPrecios('ALCANCE_NO_EQUIVALENTE').tono).toBe('ATENCION');
    expect(presentacionPrecios('POR_ENCIMA_DEL_RANGO').tono).toBe('ATENCION');
    expect(presentacionPrecios('POR_DEBAJO_DEL_RANGO').tono).toBe('ATENCION');
  });
  it('una comparación pendiente no se presenta como completa ni concluye ausencia de sobrecostos', () => {
    for (const r of ['SIN_CONTRATO_SOPORTADO', 'EVIDENCIA_INSUFICIENTE'] as const) {
      const p = presentacionPrecios(r, { estudio_mercado_identificado: true });
      expect(`${p.etiqueta} ${p.detalle ?? ''}`).not.toMatch(/dentro del rango|sin sobrecosto|no hay sobrecosto/i);
    }
  });
});
