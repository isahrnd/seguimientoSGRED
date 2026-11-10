import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { normalizar } from './contratacion-sugerencias';

export const BASES_COTIZACION = ['COSTO_DIRECTO', 'TOTAL'] as const;
export const VERIFICACIONES = ['VERIFICADO_EN_IMAGEN', 'COINCIDE_CON_PDF', 'PENDIENTE'] as const;

export interface CotizacionEdificioEntrada {
  edificio: string;
  /** Huella (MD5) de la versión del documento que sustenta el importe. */
  documento: string;
  proveedor: string;
  concepto: string;
  importe: number;
  base: (typeof BASES_COTIZACION)[number];
  total_oferta?: number | null;
  alcance_oferta?: string | null;
  pagina?: number | null;
  hoja?: string | null;
  celda?: string | null;
  verificacion: (typeof VERIFICACIONES)[number];
  nota?: string | null;
  /** Solo si existe un número de proceso verificable; si no, la cotización queda ligada solo al edificio. */
  proceso?: string | null;
}

const CELDA = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/;

/** Valida una entrada sin tocar la BD (reglas puras, probadas sin base de datos). */
export function validarEntrada(c: CotizacionEdificioEntrada, i: number): string[] {
  const e: string[] = [];
  const p = `cotizaciones_edificio[${i}]`;
  if (!c || typeof c !== 'object') return [`${p}: formato no válido`];
  if (!c.edificio?.trim()) e.push(`${p}: falta el edificio`);
  if (!/^[a-f0-9]{32}$/i.test(String(c.documento ?? ''))) e.push(`${p}: «documento» debe ser la huella MD5 de la versión`);
  if (!c.proveedor?.trim()) e.push(`${p}: falta el proveedor`);
  if (!c.concepto?.trim()) e.push(`${p}: falta el concepto`);
  if (typeof c.importe !== 'number' || !Number.isFinite(c.importe) || c.importe <= 0) e.push(`${p}: importe no válido`);
  if (!BASES_COTIZACION.includes(c.base)) e.push(`${p}: base no válida`);
  if (!VERIFICACIONES.includes(c.verificacion)) e.push(`${p}: verificación no válida`);
  const pdf = c.pagina !== undefined && c.pagina !== null;
  const xls = !!c.hoja || !!c.celda;
  if (pdf === xls) e.push(`${p}: indique una sola fuente: página (PDF) u hoja y celda (Excel)`);
  if (pdf && (!Number.isInteger(c.pagina) || (c.pagina as number) < 1)) e.push(`${p}: página no válida`);
  if (xls && (!c.hoja?.trim() || !CELDA.test(String(c.celda ?? '')))) e.push(`${p}: hoja y celda deben indicarse (p. ej. I2)`);
  if (c.verificacion === 'VERIFICADO_EN_IMAGEN' && !pdf) e.push(`${p}: «verificado en imagen» exige página del PDF`);
  return e;
}

export const claveCotizacion = (edificioId: number, versionId: number, c: CotizacionEdificioEntrada) =>
  [edificioId, versionId, normalizar(c.proveedor), c.pagina ?? `${c.hoja}!${c.celda}`].join('|');

/**
 * Registra importes de cotizaciones por edificación (p. ej. una oferta conjunta de varios edificios cuyo precio por
 * edificio consta en una tabla del PDF). Idempotente. Un expediente solo se asocia con un número de proceso existente.
 */
@Injectable()
export class ContratacionCotizacionesEdificioService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolver(payload: any) {
    const errores: string[] = [];
    const lista: CotizacionEdificioEntrada[] = Array.isArray(payload?.cotizaciones_edificio) ? payload.cotizaciones_edificio : [];
    if (lista.length === 0) errores.push('No hay «cotizaciones_edificio» para importar');
    const filas: { c: CotizacionEdificioEntrada; edificioId: number; versionId: number; expedienteId: number | null; clave: string }[] = [];
    for (const [i, c] of lista.entries()) {
      const ev = validarEntrada(c, i);
      if (ev.length) { errores.push(...ev); continue; }
      const ed = await this.prisma.contratacionEdificio.findUnique({ where: { nombre_norm: normalizar(c.edificio) } });
      if (!ed) { errores.push(`cotizaciones_edificio[${i}]: el edificio no existe`); continue; }
      const ver = await this.prisma.contratacionDocumentoVersion.findFirst({ where: { md5: c.documento.toLowerCase() } });
      if (!ver) { errores.push(`cotizaciones_edificio[${i}]: documento no indexado (actualice el índice antes de importar)`); continue; }
      let expedienteId: number | null = null;
      if (c.proceso?.trim()) {
        const ex = await this.prisma.contratacionExpediente.findUnique({ where: { proceso: c.proceso.trim() } });
        if (!ex) { errores.push(`cotizaciones_edificio[${i}]: el número de proceso no es verificable (no existe el expediente)`); continue; }
        expedienteId = ex.id;
      }
      filas.push({ c, edificioId: ed.id, versionId: ver.id, expedienteId, clave: claveCotizacion(ed.id, ver.id, c) });
    }
    return { errores, filas };
  }

  async previsualizar(payload: any) {
    const { errores, filas } = await this.resolver(payload);
    const existentes = await this.prisma.contratacionCotizacionEdificio.findMany({ where: { clave: { in: filas.map((f) => f.clave) } } });
    const por = new Map(existentes.map((x) => [x.clave, x]));
    let crear = 0, actualizar = 0, sin_cambios = 0;
    for (const f of filas) {
      const x = por.get(f.clave);
      if (!x) crear++;
      else if (this.cambia(x, f)) actualizar++;
      else sin_cambios++;
    }
    return { valida: errores.length === 0, errores, advertencias: [] as string[], resumen: { crear, actualizar, sin_cambios } };
  }

  private cambia(x: any, f: { c: CotizacionEdificioEntrada; expedienteId: number | null }) {
    return Number(x.importe) !== f.c.importe || x.base !== f.c.base || x.verificacion !== f.c.verificacion || x.expediente_id !== f.expedienteId ||
      Number(x.total_oferta ?? 0) !== Number(f.c.total_oferta ?? 0) || (x.nota ?? null) !== (f.c.nota ?? null) || (x.concepto !== f.c.concepto);
  }

  async aplicar(payload: any) {
    const v = await this.previsualizar(payload);
    if (!v.valida) throw new BadRequestException({ message: 'La carga no es válida', errores: v.errores });
    if (v.resumen.crear === 0 && v.resumen.actualizar === 0) return { aplicada: false, mensaje: 'Sin cambios: la carga ya estaba aplicada', resumen: v.resumen };
    const { filas } = await this.resolver(payload);
    await this.prisma.$transaction(async (tx: any) => {
      for (const f of filas) {
        const datos = {
          edificio_id: f.edificioId, version_id: f.versionId, expediente_id: f.expedienteId, proveedor: f.c.proveedor.trim(), concepto: f.c.concepto.trim(),
          importe: f.c.importe, base: f.c.base, total_oferta: f.c.total_oferta ?? null, alcance_oferta: f.c.alcance_oferta ?? null,
          pagina: f.c.pagina ?? null, hoja: f.c.hoja ?? null, celda: f.c.celda ?? null, verificacion: f.c.verificacion, nota: f.c.nota ?? null,
        };
        await tx.contratacionCotizacionEdificio.upsert({ where: { clave: f.clave }, create: { clave: f.clave, ...datos }, update: datos });
      }
    });
    return { aplicada: true, resumen: v.resumen };
  }

  /** Cotizaciones de una edificación con su fuente, para la ficha. */
  async deEdificio(edificioId: number) {
    const filas = await this.prisma.contratacionCotizacionEdificio.findMany({
      where: { edificio_id: edificioId },
      include: { version: { include: { documento: true } }, expediente: { select: { id: true, proceso: true } } },
      orderBy: [{ proveedor: 'asc' }, { id: 'asc' }],
    });
    const vigentes = new Map<number, number>();
    for (const f of filas) {
      const vig = await this.prisma.contratacionDocumentoVersion.findFirst({ where: { documento_id: f.version.documento_id, vigente: true }, select: { id: true } });
      if (vig) vigentes.set(f.version.documento_id, vig.id);
    }
    return filas.map((f) => ({
      id: f.id, proveedor: f.proveedor, concepto: f.concepto, importe: Number(f.importe), base: f.base,
      total_oferta: f.total_oferta === null ? null : Number(f.total_oferta), alcance_oferta: f.alcance_oferta,
      verificacion: f.verificacion, nota: f.nota,
      proceso: f.expediente ? { id: f.expediente.id, proceso: f.expediente.proceso } : null,
      soporte: {
        version_id: f.version_id, documento_id: f.version.documento_id, documento: f.version.documento.nombre, numero_version: f.version.numero,
        es_vigente: f.version.vigente, version_vigente_id: f.version.vigente ? null : vigentes.get(f.version.documento_id) ?? null,
        pagina: f.pagina, hoja: f.hoja, celda: f.celda,
      },
    }));
  }
}
