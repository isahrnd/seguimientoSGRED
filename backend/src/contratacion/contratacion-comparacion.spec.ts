import { decidirCelda } from './contratacion-cambios';
import { clasificar } from './contratacion-clasificador';
import { diferenciasAlcance, diferenciasSinExplicar, requisitoResolucion, valoresPorSignificado } from './contratacion-comparacion';
import { sincronizacionMinutos } from './contratacion.config';
import { validarImportacion } from './contratacion-importacion.validador';

const MD5 = 'b'.repeat(32);
const sop = { documento_id: 1, version_id: 1, documento: 'doc', pagina: 2, hoja: null, celda: null };

describe('valores por significado', () => {
  it('cinco significados siempre; sin contrato ni acta quedan pendientes de soporte', () => {
    const r = valoresPorSignificado({
      valores: [
        { tipo: 'PRESUPUESTO_OFICIAL', importe: 100, concepto: 'Oficial', estado_soporte: 'RESPALDADO', oferta: null, soporte: sop },
        { tipo: 'COTIZADO', importe: 100, concepto: 'Cotización', estado_soporte: 'RESPALDADO', oferta: 'Empresa', soporte: sop },
      ],
      contratos: [],
      seleccionJustificada: [],
    });
    expect(r.map((x) => x.estado)).toEqual(['SOPORTADO', 'SOPORTADO', 'PENDIENTE_SOPORTE', 'PENDIENTE_SOPORTE', 'PENDIENTE_SOPORTE']);
    // Mismo monto en dos significados: cada uno conserva su propia fuente.
    expect(r[0].importes[0].importe).toBe(r[1].importes[0].importe);
  });
  it('un ejecutado citado sin acta no se presenta como respaldado', () => {
    const r = valoresPorSignificado({ valores: [{ tipo: 'EJECUTADO', importe: 5, concepto: null, estado_soporte: 'CITADO_SIN_ACTA', oferta: null, soporte: sop }], contratos: [], seleccionJustificada: [] });
    expect(r[4].estado).toBe('CITADO_SIN_ACTA');
  });
  it('la oferta seleccionada requiere contrato o justificación documentada', () => {
    const v = [{ tipo: 'COTIZADO', importe: 9, concepto: 'c', estado_soporte: 'RESPALDADO', oferta: 'A', soporte: sop }];
    expect(valoresPorSignificado({ valores: v, contratos: [], seleccionJustificada: [] })[2].estado).toBe('PENDIENTE_SOPORTE');
    expect(valoresPorSignificado({ valores: v, contratos: [{ valor: 9, tipo_acto: 'CONTRATO', oferta: 'A', soporte: sop }], seleccionJustificada: [] })[2].importes).toHaveLength(1);
  });
});

describe('alcance y diferencias', () => {
  const o = (proveedor: string, incluye: string[]) => ({ clave: proveedor, proveedor, incluye, excluye: [], lineas: [] });
  it('con una sola oferta no hay con qué contrastar', () => {
    expect(diferenciasAlcance([o('A', ['Demolición'])])).toMatchObject({ comparables: false, hay_diferencias: false });
  });
  it('señala maquinaria especial o transporte que solo incluye una oferta', () => {
    const r = diferenciasAlcance([o('A', ['Demolición con equipo de largo alcance y transporte en volquetas']), o('B', ['Demolición manual'])]);
    expect(r.hay_diferencias).toBe(true);
    expect(r.diferencias.map((d) => d.concepto)).toEqual(expect.arrayContaining(['Maquinaria o equipo especial', 'Transporte de materiales']));
    expect(r.aviso).toMatch(/antes de interpretar/);
  });
});

describe('resolución de demolición', () => {
  it('una demolición sin resolución queda pendiente aunque exista cotización', () => {
    expect(requisitoResolucion([{ alcance_confirmado: null, actividades: ['Demolición mecánica'] }], 0, 0)).toBe('PENDIENTE_SOPORTE');
  });
  it('RCD sin demolición confirmado: no aplica; sin confirmar: por confirmar', () => {
    expect(requisitoResolucion([{ alcance_confirmado: 'RCD_SIN_DEMOLICION', actividades: ['Retiro de RCD'] }], 0, 0)).toBe('NO_APLICA');
    expect(requisitoResolucion([{ alcance_confirmado: null, actividades: ['Retiro de RCD'] }], 0, 0)).toBe('POR_CONFIRMAR_ALCANCE');
  });
  it('solo la resolución verificada con soporte la deja verificada', () => {
    expect(requisitoResolucion([{ alcance_confirmado: 'DEMOLICION', actividades: [] }], 1, 0)).toBe('VERIFICADA');
    expect(requisitoResolucion([{ alcance_confirmado: 'DEMOLICION', actividades: [] }], 0, 1)).toBe('PENDIENTE_SOPORTE');
  });
  it('un edificio sin proceso ni resolución no inventa un requisito', () => {
    expect(requisitoResolucion([], 0, 0)).toBe('SIN_INTERVENCION');
  });
});

describe('diferencias sin explicar', () => {
  it('no concluye "sin sobrecostos": enumera lo que los documentos no explican', () => {
    const sig = valoresPorSignificado({
      valores: [
        { tipo: 'PRESUPUESTO_OFICIAL', importe: 100, concepto: null, estado_soporte: 'RESPALDADO', oferta: null, soporte: sop },
        { tipo: 'COTIZADO', importe: 120, concepto: null, estado_soporte: 'RESPALDADO', oferta: 'A', soporte: sop },
        { tipo: 'EJECUTADO', importe: 90, concepto: null, estado_soporte: 'CITADO_SIN_ACTA', oferta: null, soporte: sop },
      ],
      contratos: [],
      seleccionJustificada: [],
    });
    const codigos = diferenciasSinExplicar(sig, ['Forma de pago por armonizar']).map((d) => d.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['COTIZACION_VS_OFICIAL', 'EJECUTADO_SIN_CONTRATO', 'PENDIENTE_ACLARACION']));
  });
});

describe('cambios de cifras y sincronización', () => {
  it('celda igual se revincula; distinta se señala', () => {
    expect(decidirCelda('100', '100').accion).toBe('REVINCULAR');
    expect(decidirCelda('100', '120')).toMatchObject({ accion: 'ALERTAR', valor_anterior: '100', valor_nuevo: '120' });
    expect(decidirCelda(null, null).accion).toBe('REVINCULAR');
  });
  it('intervalo configurable con límites; 0 desactiva', () => {
    const k = 'SEGUIMIENTO_SYNC_MINUTOS';
    const prev = process.env[k];
    try {
      delete process.env[k];
      expect(sincronizacionMinutos()).toBe(30);
      process.env[k] = '0';
      expect(sincronizacionMinutos()).toBe(0);
      process.env[k] = '1';
      expect(sincronizacionMinutos()).toBe(5);
      process.env[k] = '99999';
      expect(sincronizacionMinutos()).toBe(1440);
      process.env[k] = 'abc';
      expect(sincronizacionMinutos()).toBe(30);
    } finally {
      if (prev === undefined) delete process.env[k];
      else process.env[k] = prev;
    }
  });
});

describe('clasificación de las categorías nuevas', () => {
  it.each([
    ['Estudio de mercado demoliciones.pdf', 'ESTUDIO_MERCADO'],
    ['Cuadro comparativo general.xlsx', 'COMPARATIVO_GENERAL'],
    ['Resolución 4163.010.32.1.050 demolición.pdf', 'RESOLUCION_DEMOLICION'],
    ['Informe de visita edificio.pdf', 'VISITA_SOPORTE_TECNICO'],
    ['Evaluación ATC-20 torre.pdf', 'VISITA_SOPORTE_TECNICO'],
  ])('%s => %s', (nombre, cat) => {
    expect(clasificar(nombre, '').categoria).toBe(cat);
  });
});

describe('validación de la importación ampliada', () => {
  const exp = (extra: any = {}) => ({ proceso: '9999.001.32.1.001-2030', intervencion: 'x', ...extra });
  it('acepta hoja y celda, edificios y resoluciones; rechaza celda mal formada', () => {
    const ok = validarImportacion({
      version: 1,
      expedientes: [exp({ alcance_confirmado: 'RCD_SIN_DEMOLICION', valores: [{ clave: 'v', tipo: 'COTIZADO', concepto: 'c', importe: 1, fuente: { documento: MD5, hoja: 'H', celda: 'B2' } }] })],
      edificios: [{ nombre: 'Edificio X' }],
      resoluciones: [{ numero: '4163.010.32.1.123-2030', edificios: ['Edificio X'], fuente: { documento: MD5, pagina: 1 } }],
    });
    expect(ok.errores).toEqual([]);
    const mal = validarImportacion({ version: 1, expedientes: [exp({ valores: [{ clave: 'v', tipo: 'COTIZADO', concepto: 'c', importe: 1, fuente: { documento: MD5, hoja: 'H', celda: '2B' } }] })] });
    expect(mal.errores.join(' ')).toMatch(/celda válida/);
  });
  it('una resolución verificada exige su documento y un alcance desconocido se rechaza', () => {
    const r = validarImportacion({ version: 1, resoluciones: [{ numero: '4163.010.32.1.123-2030', edificios: ['A B C'] }] });
    expect(r.errores.join(' ')).toMatch(/falta la fuente/);
    expect(validarImportacion({ version: 1, expedientes: [exp({ alcance_confirmado: 'OTRO' })] }).errores.join(' ')).toMatch(/alcance_confirmado/);
  });
  it('un valor contratado sigue sin poder registrarse como valor suelto', () => {
    const r = validarImportacion({ version: 1, expedientes: [exp({ valores: [{ clave: 'v', tipo: 'CONTRATADO', concepto: 'c', importe: 1, fuente: { documento: MD5 } }] })] });
    expect(r.errores.join(' ')).toMatch(/solo se registra en "contratos"/);
  });
});

describe('aclaraciones anteriores al contrato', () => {
  const sig = (tipo: any, importes: any[]) => ({ tipo, etiqueta: tipo, estado: importes.length ? 'SOPORTADO' : 'PENDIENTE_SOPORTE', importes });
  const base = (contratado: any[]) => [sig('PRESUPUESTO_OFICIAL', []), sig('COTIZACION', []), sig('OFERTA_SELECCIONADA', []), sig('VALOR_CONTRATADO', contratado), sig('VALOR_EJECUTADO', [])] as any;
  it('con contrato ya no dice «sin contrato» y conserva lo que falta (acta o pago)', () => {
    const r = diferenciasSinExplicar(base([{ importe: 10, concepto: null, proveedor: null, soporte: null, estado_soporte: 'RESPALDADO' }]), ['Sin contrato, acta ni soporte de pago que acredite lo contratado o ejecutado']);
    expect(r[0].descripcion).toMatch(/Sin acta ni soporte de pago/);
    expect(r[0].descripcion).not.toMatch(/Sin contrato/);
  });
  it('sin contrato conserva la aclaración original', () => {
    const r = diferenciasSinExplicar(base([]), ['Sin contrato, acta ni soporte de pago que acredite lo contratado o ejecutado']);
    expect(r[0].descripcion).toMatch(/^Sin contrato/);
  });
});
