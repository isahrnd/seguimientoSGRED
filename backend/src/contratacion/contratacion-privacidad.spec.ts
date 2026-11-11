import { construirSolicitud, depurar } from './contratacion-ia';
import { textoDeSolicitud, verificarPrivacidad } from './contratacion-privacidad';

// Casos que ya fallaron en el piloto, con datos INVENTADOS.
const CASOS: Array<[string, string, string]> = [
  ['cédula con #', 'CONTRATISTA: JUANA PEREZ , C.C.# 9.111.222.333 R/L. EMPRESA SAS', 'documento_identidad'],
  ['identificación del inspector', 'Inspector Nombre Pedro Pablo Ejemplo Código de brigada 050 Identificación 1234567890 Entidad Voluntario', 'documento_identidad'],
  ['nombre del inspector', 'Inspector Nombre Pedro Pablo Ejemplo Código de brigada 050', 'nombre_inspector'],
  ['matrícula profesional con guion espaciado', 'con matrícula profesional No. 11111 - 222222XYZ, practicó', 'matricula_profesional'],
  ['ingeniero y su nombre', 'Que el ingeniero Pedro Pablo Ejemplo Prueba, con matrícula', 'nombre_tras_tratamiento'],
  ['identificada con', 'y MARIA LUISA GOMEZ DIAZ, identificada con C.C. No. 9.111.222.333 expedida en Cali', 'documento_identidad'],
  ['firmante', 'Nombre: MARIA LUISA GOMEZ DIAZ Cargo: Representante Legal', 'firmante_con_cargo'],
  ['destinatario', 'Doctor PEDRO PABLO EJEMPLO PRUEBA alcalde de la ciudad', 'nombre_tras_tratamiento'],
  ['correo y móvil', 'escriba a persona@ejemplo.com o llame al 300 123 4567', 'correo'],
];

describe('barrera de privacidad', () => {
  it.each(CASOS)('detecta en el texto crudo y no queda nada tras depurar: %s', (_n, crudo, tipo) => {
    expect(verificarPrivacidad(crudo).map((h) => h.tipo)).toContain(tipo);
    expect(verificarPrivacidad(depurar(crudo))).toEqual([]);
  });

  it('detecta lo que depurar no suprime (pasaporte, tarjeta profesional) y devuelve solo tipos y recuentos', () => {
    const h = verificarPrivacidad(depurar('Titular con pasaporte No. AB1234567 y T.P. 123456 del consejo'));
    expect(h.map((x) => x.tipo)).toEqual(['documento_extranjero_o_profesional']);
    expect(JSON.stringify(h)).not.toMatch(/AB1234567|123456/);
    expect(h[0].cantidad).toBe(2);
  });

  it('un móvil con prefijo de país, partido por saltos de línea o espacios dobles, se suprime sin tocar importes ni cifras financieras', () => {
    const crudo = 'Comuníquese al teléfono o WhatsApp al +57 313\n503  7777 o al fijo 602 555 0000. Total $ 9.402.324.207,02; ítem $ 781.227.904; suma 13.038.128.470; cotización 136; NIT 900.123.456-1';
    expect(verificarPrivacidad(crudo.replace(/\s+/g, ' ')).map((h) => h.tipo)).toContain('movil');
    const limpio = depurar(crudo);
    expect(verificarPrivacidad(limpio.replace(/\s+/g, ' '))).toEqual([]);
    expect(limpio).toContain('$ 9.402.324.207,02');
    expect(limpio).toContain('$ 781.227.904');
    expect(limpio).toContain('13.038.128.470');
    expect(limpio).toContain('cotización 136');
  });

  it('un número de proceso, de contrato o un importe no se confunden con una identificación', () => {
    expect(verificarPrivacidad(depurar('Documento No. 9999.001.32.1.501-2030 contrato 9999.001.26.1.501-2030 valor $123.456.789,12 NIT 900.123.456-1'))).toEqual([]);
  });

  it('la solicitud completa (sistema, herramienta y fragmentos) de un texto limpio pasa; con un dato personal en un fragmento, se detecta', () => {
    const limpio = construirSolicitud([{ pagina: 1, texto: depurar('CONTRATO No 9999.001.26.1.501-2030 Contratista: EMPRESA UNO SAS C.C. 9.111.222.333') }], 1000);
    expect(verificarPrivacidad(textoDeSolicitud(limpio))).toEqual([]);
    const sucio = construirSolicitud([{ pagina: 1, texto: 'Titular con pasaporte No. AB1234567' }], 1000);
    expect(verificarPrivacidad(textoDeSolicitud(sucio)).map((x) => x.tipo)).toEqual(['documento_extranjero_o_profesional']);
  });
});
