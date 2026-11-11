import { compararEdificio, similitud } from './contratacion-edificios-match';

// Edificios ficticios con la misma situación que una cotización con 5 edificios y 3 vinculados.
const reg = [
  { id: 1, nombre: 'Hotel Aurora', vinculado: true },
  { id: 2, nombre: 'Centro Comercial y Residencial Mirador', vinculado: true },
  { id: 3, nombre: "Conjunto Multifamiliar Los Pinos (D'Alfa)", vinculado: true },
  { id: 4, nombre: 'Edificio Cedrus', vinculado: false },
];

describe('comparación de edificios de una tabla con los registrados', () => {
  it('igual, parecido vinculado, parecido no vinculado y sin coincidencia', () => {
    expect(compararEdificio('Hotel Áurora', reg)).toMatchObject({ estado: 'COINCIDE', edificio_id: 1, vinculado_al_documento: true });
    expect(compararEdificio('Ed. Mirrador', reg)).toMatchObject({ estado: 'POSIBLE', edificio_id: 2, vinculado_al_documento: true });
    expect(compararEdificio('Ed. D Alfa', reg)).toMatchObject({ estado: 'POSIBLE', edificio_id: 3 });
    expect(compararEdificio('Ed. Cedruss', reg)).toMatchObject({ estado: 'POSIBLE', edificio_id: 4, vinculado_al_documento: false });
    expect(compararEdificio('Multifamiliar las Acacias', reg)).toMatchObject({ estado: 'SIN_COINCIDENCIA', edificio_id: null });
  });
  it('un nombre demasiado corto o genérico no coincide con nada', () => {
    expect(compararEdificio('Ed.', reg).estado).toBe('SIN_COINCIDENCIA');
    expect(similitud('a', 'b')).toBe(0);
  });
});
