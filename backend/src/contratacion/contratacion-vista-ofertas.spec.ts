import { fuenteDePartida, ofertasDeLectura } from './contratacion-vista-ofertas';

// Datos SINTÉTICOS.
const B = { id: 5, nombre: 'Edificio Alfa' };
const coin = (estado: string, id: number, vinc = true) => ({ estado, edificio_id: id, edificio: 'x', vinculado_al_documento: vinc });
const p = (o: any) => ({ nivel: 'PARTIDA', edificio: null, alcance: 'Actividad', importe: 100, unidad: 'GLOBAL', pagina: 3, coincidencia: null, ...o });

describe('ofertas de un edificio desde la lectura de los documentos', () => {
  it('oferta de un solo edificio (filas con su nombre, documento vinculado): costo directo, AIU, IVA y total con su fuente', () => {
    const e = {
      version_id: 10, documento: '3. EMPRESA UNO', origen: 'ASISTIDA', edificios_vinculados_al_documento: 1, campos: [{ campo: 'contratista', valor: 'EMPRESA UNO S.A.' }],
      partidas: [
        p({ edificio: 'EDIFICIO ALFA', alcance: 'Desmontaje y demolición — EDIFICIO ALFA (costo directo)', importe: 1000, cantidad: 1, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'SUBTOTAL', edificio: 'EDIFICIO ALFA', alcance: 'Total costo directo', importe: 1000, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'IMPUESTO_O_AIU', edificio: 'EDIFICIO ALFA', alcance: 'Administración 15% (AIU)', importe: 150, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'IMPUESTO_O_AIU', edificio: 'EDIFICIO ALFA', alcance: 'Imprevistos 3% (AIU)', importe: 30, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'IMPUESTO_O_AIU', edificio: 'EDIFICIO ALFA', alcance: 'Utilidad 5% (AIU)', importe: 50, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'SUBTOTAL', edificio: 'EDIFICIO ALFA', alcance: 'Total antes de IVA', importe: 1230, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'IMPUESTO_O_AIU', edificio: 'EDIFICIO ALFA', alcance: 'IVA 19% sobre la utilidad', importe: 9.5, coincidencia: coin('POSIBLE', 5) }),
        p({ nivel: 'TOTAL', edificio: 'EDIFICIO ALFA', alcance: 'Total de la oferta (total propuesta)', importe: 1239.5, coincidencia: coin('POSIBLE', 5) }),
      ],
      controles_aritmeticos: [{ control: 'Total antes de IVA + IVA = total de la propuesta', estado: 'CUADRA', diferencia: 0 }],
    };
    const [o] = ofertasDeLectura([e], B);
    expect(o.empresa).toBe('EMPRESA UNO');
    expect(o.nivel).toBe('COSTO_DIRECTO');
    expect(o.componentes).toEqual({ costo_directo: 1000, administracion: 150, imprevistos: 30, utilidad: 50, iva: 9.5, total: 1239.5 });
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ subtotal: 1000, cantidad: 1, unidad: 'Global' });
    expect(o.items[0].actividad).not.toMatch(/costo directo/);
    expect(o.fuentes_componentes.total).toMatchObject({ version_id: 10, pagina: 3 });
    expect(o.oferta_conjunta).toBeNull();
    expect(o.controles).toHaveLength(1);
  });

  it('oferta conjunta: solo las filas de ESTE edificio; el total de la oferta se informa como contexto y no se le atribuye', () => {
    const e = {
      version_id: 20, documento: '4. EMPRESA DOS.pdf', origen: 'ASISTIDA', edificios_vinculados_al_documento: 3, campos: [],
      partidas: [
        p({ edificio: 'EDIFICIO ALFA', alcance: 'Demolición total', importe: 500, coincidencia: coin('COINCIDE', 5) }),
        p({ edificio: 'EDIFICIO BETA', alcance: 'Demolición total', importe: 700, coincidencia: coin('COINCIDE', 6) }),
        p({ edificio: 'EDIFICIO GAMMA', alcance: 'Demolición total', importe: 900, coincidencia: null }),
        p({ nivel: 'TOTAL', alcance: 'Total de la oferta', importe: 2100 }),
      ],
      controles_aritmeticos: [{ control: 'Total de ítems + administración + imprevistos + utilidad = total antes de IVA', estado: 'NO_CUADRA', diferencia: -0.4 }],
    };
    const [o] = ofertasDeLectura([e], B);
    expect(o.items.map((i) => i.subtotal)).toEqual([500]);
    expect(o.componentes.total).toBeNull();
    expect(o.componentes.costo_directo).toBe(500); // el documento calcula AIU sobre los ítems: cada ítem es costo directo
    expect(o.oferta_conjunta).toEqual({ edificios: 3, total: 2100 });
    expect(o.empresa).toBe('EMPRESA DOS');
  });

  it('un nombre solo parecido, sin documento vinculado al edificio, no relaciona la fila', () => {
    const e = { version_id: 30, documento: 'x.pdf', origen: 'ASISTIDA', edificios_vinculados_al_documento: 2, campos: [], partidas: [p({ edificio: 'Ed. Alfa', importe: 10, coincidencia: coin('POSIBLE', 5, false) })] };
    expect(ofertasDeLectura([e], B)).toEqual([]);
  });

  it('un documento con varios edificios y filas sin nombre no se atribuye a ninguno', () => {
    const e = { version_id: 31, documento: 'y.pdf', origen: 'ASISTIDA', edificios_vinculados_al_documento: 3, campos: [], partidas: [p({ importe: 10 }), p({ importe: 20 })] };
    expect(ofertasDeLectura([e], B)).toEqual([]);
  });

  it('Excel de un solo edificio: «Costos directos» explícito, con hoja y celda de cada importe', () => {
    const e = {
      version_id: 40, documento: '5. EMPRESA TRES (v40)', origen: 'HOJA_DE_CALCULO', edificios_vinculados_al_documento: 1, campos: [{ campo: 'proveedor', valor: 'EMPRESA TRES' }, { campo: 'fecha_cotizacion', valor: '2026-09-18' }, { campo: 'numero_cotizacion', valor: '77-1' }],
      partidas: [
        p({ alcance: 'Demolición', importe: 600, unidad: 'GL', cantidad: 1, precio_unitario: 600, fuente: 'Hoja RESUMEN, celda H45', pagina: undefined }),
        p({ nivel: 'COMPONENTE_SIN_VALOR', alcance: 'Detalle', importe: null }),
        p({ nivel: 'SUBTOTAL', alcance: 'Subtotal', importe: 600, fuente: 'Hoja RESUMEN, celda H55' }),
        p({ nivel: 'SUBTOTAL', alcance: 'Costos directos', importe: 600, fuente: 'Hoja RESUMEN, celda H57' }),
        p({ nivel: 'TOTAL', alcance: 'Total proyecto', importe: 780, fuente: 'Hoja RESUMEN, celda H62' }),
      ],
      controles_aritmeticos: [],
    };
    const [o] = ofertasDeLectura([e], B);
    expect(o).toMatchObject({ empresa: 'EMPRESA TRES', fecha: '2026-09-18', referencia: '77-1', nivel: 'COSTO_DIRECTO' });
    expect(o.componentes.costo_directo).toBe(600);
    expect(o.fuentes_componentes.costo_directo).toMatchObject({ hoja: 'RESUMEN', celda: 'H57' });
    expect(o.items).toEqual([expect.objectContaining({ subtotal: 600, precio_unitario: 600, cantidad: 1, unidad: 'Global' })]);
    expect(o.items[0].fuente).toMatchObject({ hoja: 'RESUMEN', celda: 'H45' });
  });

  it('las hojas adicionales pendientes de correspondencia y las lecturas nativas no son ofertas', () => {
    expect(ofertasDeLectura([{ version_id: 1, documento: 'a', origen: 'HOJA_DE_CALCULO', excluida_de_indicadores: true, edificios_vinculados_al_documento: 0, partidas: [p({ importe: 5 })], campos: [] }], B)).toEqual([]);
    expect(ofertasDeLectura([{ version_id: 2, documento: 'b', origen: 'NATIVA', edificios_vinculados_al_documento: 1, partidas: [p({ importe: 5 })], campos: [] }], B)).toEqual([]);
  });

  it('analiza la fuente de una partida', () => {
    expect(fuenteDePartida({ fuente: 'Hoja RESUMEN (2), celda H9' }, 1, 'd')).toMatchObject({ hoja: 'RESUMEN (2)', celda: 'H9', pagina: null });
    expect(fuenteDePartida({ pagina: 8 }, 1, 'd')).toMatchObject({ pagina: 8, hoja: null });
  });
});
