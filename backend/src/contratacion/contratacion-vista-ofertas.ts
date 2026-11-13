import type { FuenteDato, ItemOferta, NivelOferta, OfertaEdificio } from './contratacion-vista-precios';

/**
 * Ofertas de un edificio a partir de la lectura de los documentos: cada partida, tabla o fila se relaciona con SU edificio por el nombre que consta en la
 * propia fila. Un mismo documento puede respaldar varios edificios; el total de una oferta conjunta no se atribuye a ninguno (se informa como contexto).
 * Reglas deterministas; nada se reparte ni se completa por proporción.
 */

export interface CotizacionVerificada { version_id: number; proveedor: string; importe: number; base: string; total_oferta: number | null; fecha_oferta: string | null; edificio_id: number }

/** «Hoja RESUMEN, celda H29» → hoja y celda; un número es la página. */
export function fuenteDePartida(p: any, version_id: number, documento: string): FuenteDato {
  const f = typeof p?.fuente === 'string' ? p.fuente : null;
  const m = f ? /Hoja\s+(.+?),\s*celda\s+([A-Z]{1,3}\d+)/i.exec(f) : null;
  return { version_id, documento, pagina: m ? null : (typeof p?.pagina === 'number' ? p.pagina : null), hoja: m ? m[1] : null, celda: m ? m[2] : null };
}

const empresaDe = (entrada: any): string => {
  const campo = (n: string) => (entrada.campos ?? []).find((c: any) => c.campo === n)?.valor;
  const dato = campo('proveedor') ?? campo('contratista');
  if (dato) return String(dato).replace(/\s+/g, ' ').replace(/\s+(S\.?A\.?S?\.?|S\.?A\.?|LTDA\.?)$/i, '').trim();
  return String(entrada.documento ?? '').replace(/\.(pdf|xlsx?)$/i, '').replace(/^\s*\d+\s*[.)-]\s*/, '').replace(/\s*\(v\d+\)$/, '').trim() || 'Sin empresa identificada';
};

const COMPONENTES: Array<[keyof OfertaEdificio['componentes'], RegExp, string]> = [
  ['costo_directo', /^(?:total\s+)?costos?\s+directos?|^subtotal$/i, 'SUBTOTAL'],
  ['administracion', /administraci/i, 'IMPUESTO_O_AIU'],
  ['imprevistos', /imprevist/i, 'IMPUESTO_O_AIU'],
  ['utilidad', /utilidad/i, 'IMPUESTO_O_AIU'],
  ['iva', /\biva\b/i, 'IMPUESTO_O_AIU'],
];

export function ofertasDeLectura(
  lectura: any[],
  edificio: { id: number | null; nombre: string },
  verificadas: CotizacionVerificada[] = [],
): OfertaEdificio[] {
  const salida: OfertaEdificio[] = [];
  for (const e of lectura) {
    if (e.excluida_de_indicadores || !(e.partidas ?? []).length || e.origen === 'NATIVA') continue;
    const vinculados: number = e.edificios_vinculados_al_documento ?? 0;
    const partidas: any[] = e.partidas;
    const etiquetado = partidas.some((p) => p.edificio);
    const pertenece = (p: any): boolean => {
      if (!p.edificio) return !etiquetado && vinculados === 1;
      const c = p.coincidencia;
      if (!c || edificio.id === null || c.edificio_id !== edificio.id) return false;
      return c.estado === 'COINCIDE' || (c.estado === 'POSIBLE' && c.vinculado_al_documento === true);
    };
    const mias = partidas.filter(pertenece);
    if (!mias.length) continue;
    const doc = String(e.documento);
    const items: ItemOferta[] = mias.filter((p) => (p.nivel ?? 'PARTIDA') === 'PARTIDA' && typeof p.importe === 'number' && p.importe > 0).map((p) => ({
      actividad: String(p.alcance).replace(/\s*\(costo directo\)\s*$/i, '').slice(0, 220), unidad: p.unidad && p.unidad !== 'GLOBAL' && p.unidad !== 'GL' ? String(p.unidad) : (p.unidad ? 'Global' : null),
      cantidad: typeof p.cantidad === 'number' ? p.cantidad : null, precio_unitario: typeof p.precio_unitario === 'number' ? p.precio_unitario : null,
      subtotal: p.importe, nivel: 'PARTIDA', fuente: fuenteDePartida(p, e.version_id, doc),
    }));
    const comp: OfertaEdificio['componentes'] = { costo_directo: null, administracion: null, imprevistos: null, utilidad: null, iva: null, total: null };
    const fuentes: Record<string, FuenteDato | null> = {};
    for (const p of mias) {
      if (typeof p.importe !== 'number') continue;
      const nivel = p.nivel ?? 'PARTIDA';
      if (nivel === 'TOTAL') { comp.total = p.importe; fuentes.total = fuenteDePartida(p, e.version_id, doc); continue; }
      for (const [clave, re, niv] of COMPONENTES) {
        if (nivel === niv && re.test(String(p.alcance)) && !/antes\s+de\s+iva/i.test(String(p.alcance))) {
          // «Costos directos» explícito prevalece sobre un «Subtotal» genérico
          if (comp[clave] === null || (clave === 'costo_directo' && /costos?\s+directos?/i.test(String(p.alcance)))) { comp[clave] = p.importe; fuentes[clave] = fuenteDePartida(p, e.version_id, doc); }
        }
      }
    }
    // Costo directo: el rótulo explícito; si no, los ítems de este edificio cuando el propio documento calcula administración, imprevistos y utilidad sobre ellos.
    const controles: any[] = e.controles_aritmeticos ?? [];
    const itemsSonCostoDirecto = controles.some((c) => /total de [ií]tems\s*\+\s*administraci/i.test(c.control));
    const verificada = verificadas.find((v) => v.version_id === e.version_id && v.edificio_id === edificio.id && v.base === 'COSTO_DIRECTO');
    if (comp.costo_directo === null) {
      if (itemsSonCostoDirecto && items.length === 1) { comp.costo_directo = items[0].subtotal; fuentes.costo_directo = items[0].fuente; }
      else if (verificada) { comp.costo_directo = verificada.importe; fuentes.costo_directo = { version_id: e.version_id, documento: doc, pagina: null, hoja: null, celda: null }; }
    }
    const nivel: NivelOferta = comp.costo_directo !== null ? 'COSTO_DIRECTO' : comp.total !== null ? 'TOTAL' : 'NO_ESPECIFICADO';
    // Total de una oferta que cubre varios edificios: filas sin edificio con nivel total (contexto; no es el valor de este edificio).
    const totalConjunto = etiquetado && vinculados > 1 ? partidas.filter((p) => !p.edificio && p.nivel === 'TOTAL' && typeof p.importe === 'number').map((p) => p.importe as number).sort((a, b) => b - a)[0] ?? null : null;
    const alt = mias.map((p) => String(p.alcance)).find((a) => /alternativa\s*\d/i.test(a)) ?? null;
    const metodo = !etiquetado ? 'Documento vinculado únicamente a este edificio' : mias.some((p) => p.coincidencia?.estado === 'POSIBLE') ? 'Por el nombre del edificio en la tabla, en un documento vinculado al edificio' : 'Por el nombre del edificio en la tabla';
    salida.push({
      empresa: empresaDe(e), documento: doc.replace(/\s*\(v\d+\)$/, ''), version_id: e.version_id, etapa: 'COTIZACION',
      fecha: (e.campos ?? []).find((c: any) => c.campo === 'fecha_cotizacion')?.valor ?? verificadas.find((v) => v.version_id === e.version_id && v.edificio_id === edificio.id)?.fecha_oferta ?? null,
      referencia: (e.campos ?? []).find((c: any) => c.campo === 'numero_cotizacion')?.valor ?? null,
      nivel, items, componentes: comp, fuentes_componentes: fuentes, alcance: alt ? alt.replace(/\s*[-–]\s*total.*$/i, '') : null,
      oferta_conjunta: totalConjunto !== null || (etiquetado && vinculados > 1) ? { edificios: vinculados, total: totalConjunto } : null,
      relacion: metodo,
      controles: controles.filter((c) => /[ií]tems|costo directo|subtotal|total/i.test(c.control)).map((c) => ({ control: c.control, estado: c.estado, diferencia: c.diferencia })),
    });
  }
  return salida;
}
