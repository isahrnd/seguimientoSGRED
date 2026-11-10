import { ALCANCE_MATRIZ_ETQ, AlcanceMatriz } from './contratacion-matriz';

const num = (v: any): number | null => (v === null || v === undefined ? null : typeof v.toNumber === 'function' ? v.toNumber() : Number(v));

/** Solo se expone un enlace de SECOP II (https, dominio secop.gov.co); cualquier otro destino se descarta. */
export function enlaceSecop(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)secop\.gov\.co$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface SoporteCelda {
  version_id: number;
  documento_id: number;
  documento: string | null;
  numero_version: number;
  es_vigente: boolean;
  version_vigente_id: number | null;
  pagina: null;
  hoja: string;
  celda: string;
}

function soporte(f: any, campo: string): SoporteCelda | null {
  const celda = (f.celdas as Record<string, string> | null)?.[campo];
  if (!celda || !f.version) return null;
  return {
    version_id: f.version.id, documento_id: f.version.documento_id, documento: f.version.documento?.nombre ?? null, numero_version: f.version.numero,
    es_vigente: f.version.vigente, version_vigente_id: f.version.vigente ? null : null, pagina: null, hoja: f.hoja, celda,
  };
}

/**
 * Vista única de la matriz para un expediente: la usan el listado (Inicio y Expedientes), la ficha y la exportación, de modo que
 * el valor y la fuente sean los mismos en todas partes. `filas` debe traer `version` (con `documento`) y solo versiones vigentes.
 * El valor de la matriz NO se suma a los totales contractuales: es el valor reportado, con su celda como fuente.
 */
export function vistaMatriz(filas: any[] | undefined, contratos: any[] | undefined) {
  const todas = (filas ?? []).map((f) => ({
    id: f.id as number,
    hoja: f.hoja as string,
    fila: f.fila as number,
    tipo_hoja: f.tipo_hoja as 'COMPRAS' | 'ADICION',
    proceso_original: f.proceso_original as string | null,
    contrato_original: f.contrato_original as string | null,
    modalidad: f.modalidad as string | null,
    objeto: f.objeto as string | null,
    valor: num(f.valor),
    estado: f.estado as string | null,
    contratista: f.contratista as string | null,
    secop: enlaceSecop(f.secop_url),
    alcance: f.alcance as AlcanceMatriz,
    alcance_nombre: ALCANCE_MATRIZ_ETQ[f.alcance as AlcanceMatriz] ?? 'Otro alcance',
    vinculo: f.vinculo as string | null,
    soporte_valor: soporte(f, 'valor'),
    soporte_proceso: soporte(f, 'proceso_original'),
    soporte_contrato: soporte(f, 'contrato_original'),
    soporte_enlace: soporte(f, 'link'),
  }));
  const compras = todas.filter((f) => f.tipo_hoja === 'COMPRAS');
  const adiciones = todas.filter((f) => f.tipo_hoja === 'ADICION');
  const base = compras.find((f) => f.valor !== null) ?? null;
  const coincide = base && base.valor !== null ? (contratos ?? []).some((c) => Math.abs((num(c.valor) ?? -1) - base.valor!) < 0.5) : false;
  return {
    filas: todas,
    adiciones,
    valor_reportado: base && base.valor !== null
      ? {
          importe: base.valor,
          concepto: 'Valor contractual reportado en matriz',
          hoja: base.hoja,
          fila: base.fila,
          celda: base.soporte_valor?.celda ?? null,
          soporte: base.soporte_valor,
          // Si un contrato en PDF acredita el mismo importe, es una sola cifra con dos fuentes (no se suma dos veces).
          coincide_con_contrato: coincide,
        }
      : null,
  };
}
