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
    const crudo = 'Comuníquese al teléfono o WhatsApp al +57 300\n555  0199 o al fijo 602 555 0000. Total $ 8.765.432.109,87; ítem $ 123.456.789; suma 7.654.321.098; cotización 999; NIT 900.123.456-1';
    expect(verificarPrivacidad(crudo.replace(/\s+/g, ' ')).map((h) => h.tipo)).toContain('movil');
    const limpio = depurar(crudo);
    expect(verificarPrivacidad(limpio.replace(/\s+/g, ' '))).toEqual([]);
    expect(limpio).toContain('$ 8.765.432.109,87');
    expect(limpio).toContain('$ 123.456.789');
    expect(limpio).toContain('7.654.321.098');
    expect(limpio).toContain('cotización 999');
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

describe('teléfonos con prefijo y agrupaciones distintas (datos SINTÉTICOS)', () => {
  const TELEFONOS = [
    'WhatsApp +57 300 555 01 99',
    'Tel. (57) 300 555 0199',
    'Contacto 300 555 01 99',
    'Línea 300-555-01-99',
    'Escríbanos al +57 300\n555\n01 99',
    'Oficina +57 (601) 555 01 00',
    'Oficina (57) 601 555 0100',
    'Marque 0057 300 555 0199',
    'Móvil 3005550199',
  ];
  it.each(TELEFONOS)('suprime el teléfono y no deja nada que la barrera detecte: %j', (crudo) => {
    const limpio = depurar(`Texto previo ${crudo} texto posterior`);
    expect(limpio).toContain('[teléfono]');
    expect(verificarPrivacidad(limpio.replace(/\s+/g, ' '))).toEqual([]);
    expect(limpio).toContain('Texto previo');
    expect(limpio).toContain('texto posterior');
  });

  it('la barrera detecta un teléfono con prefijo o agrupado 3-3-2-2 en el texto crudo', () => {
    expect(verificarPrivacidad('al +57 300 555 01 99').map((h) => h.tipo)).toEqual(expect.arrayContaining(['telefono_con_prefijo']));
    expect(verificarPrivacidad('al 300 555 01 99').map((h) => h.tipo)).toContain('movil');
    expect(verificarPrivacidad('(57) 601 555 0100').map((h) => h.tipo)).toContain('telefono_con_prefijo');
  });

  it('no elimina importes, números de proceso o contrato, códigos ATC, NIT, matrículas ni números de cotización', () => {
    const texto = 'Total $ 3.321.860.000,00; valor asegurado $ 14.492.016.807; ítem 2.680.000.000,00; proceso 9999.001.32.1.331-2026; contrato 9999.001.26.1.300-2030; '
      + 'ATC 76001-1-0360012 y 76001-1-0300004; NIT 900.123.456-1; matrícula inmobiliaria 370 - 107419; cotización # 001830; 300.555.0199 no es un teléfono; página 3 de 15.';
    const limpio = depurar(texto);
    for (const trozo of ['$ 3.321.860.000,00', '$ 14.492.016.807', '2.680.000.000,00', '9999.001.32.1.331-2026', '9999.001.26.1.300-2030', '76001-1-0360012', '76001-1-0300004', '370 - 107419', '# 001830', '300.555.0199']) {
      expect(limpio).toContain(trozo);
    }
    expect(limpio).not.toContain('[teléfono]');
  });
});
