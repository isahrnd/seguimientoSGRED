import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { leerTablas } from './contratacion-excel';
import { fechaDeCorte, leerConsolidado, vincularFilaConsolidado } from './contratacion-consolidado';

type LeerBytes = (md5: string) => Promise<Buffer | null>;

export const CATEGORIA_CONSOLIDADO = 'CONSOLIDADO_SEGUIMIENTO';

/**
 * Consolidado de seguimiento en Excel: lectura nativa (hoja, celda y fórmula) una sola vez por versión del archivo, sin OCR ni API.
 * Es una fuente reportada, separada de contratos, actas y áreas documentadas. Reindexar sin cambios no repite la lectura.
 * El vínculo de cada fila con un edificio registrado se reevalúa siempre y solo se establece con evidencia inequívoca.
 */
@Injectable()
export class ContratacionConsolidadoService {
  private readonly log = new Logger(ContratacionConsolidadoService.name);
  constructor(private readonly prisma: PrismaService) {}

  async procesar(leer: LeerBytes): Promise<{ versiones: number; filas: number; vinculadas: number }> {
    const p = this.prisma;
    const res = { versiones: 0, filas: 0, vinculadas: 0 };
    const candidatas = await p.contratacionDocumentoVersion.findMany({
      where: { consolidado_lectura: null, vigente: true, origenes: { some: { estado: 'ACTIVO', mime: { contains: 'spreadsheetml' } } } },
      include: { documento: true },
    });
    for (const v of candidatas) {
      try {
        const buf = await leer(v.md5);
        if (!buf) continue;
        const { filas } = leerConsolidado(await leerTablas(buf));
        if (!filas.length) { await p.contratacionConsolidadoLectura.create({ data: { version_id: v.id, estado: 'NO_APLICA' } }); continue; }
        const corte = fechaDeCorte(v.documento.nombre);
        await p.$transaction(async (tx: any) => {
          await tx.contratacionConsolidadoFila.createMany({
            data: filas.map((f) => ({
              version_id: v.id, hoja: f.hoja, fila: f.fila, nombre: f.nombre, direccion: f.direccion, estado: f.estado, avance: f.avance, valor: f.valor, area_m2: f.area_m2,
              valor_m2: f.valor_m2, responsable: f.responsable, formula_valor: f.formula_valor, celdas: f.celdas as any, fecha_corte: corte ? new Date(`${corte}T00:00:00Z`) : null,
            })),
            skipDuplicates: true,
          });
          await tx.contratacionConsolidadoLectura.create({ data: { version_id: v.id, estado: 'CONSOLIDADO', filas: filas.length } });
          // Se clasifica por contenido; no pisa una categoría confirmada por una persona.
          if (v.documento.categoria === 'SIN_CATEGORIA' || v.documento.categoria === CATEGORIA_CONSOLIDADO) {
            await tx.contratacionDocumento.update({ where: { id: v.documento_id }, data: { categoria: CATEGORIA_CONSOLIDADO, estado_clasificacion: 'ASOCIADO' } });
          }
        });
        res.versiones++;
        res.filas += filas.length;
      } catch (e) {
        this.log.warn(`Sin lectura del consolidado para una versión: ${(e as Error).message}`);
      }
    }
    res.vinculadas = await this.vincular();
    return res;
  }

  /** Vincula cada fila vigente con su edificio registrado (solo con evidencia inequívoca). Idempotente; nunca crea edificios ni vínculos documentales. */
  async vincular(): Promise<number> {
    const p = this.prisma;
    const filas = await p.contratacionConsolidadoFila.findMany({ where: { version: { vigente: true } }, orderBy: { id: 'asc' } });
    if (!filas.length) return 0;
    const registrados = (await p.contratacionEdificio.findMany({ select: { id: true, nombre: true, direccion: true } })).map((e: any) => ({ ...e, vinculado: false }));
    let n = 0;
    for (const f of filas) {
      const v = vincularFilaConsolidado({ nombre: f.nombre, direccion: f.direccion }, registrados);
      const nuevo = v?.edificio_id ?? null;
      if (f.edificio_id !== nuevo || f.vinculo !== (v?.por ?? null)) await p.contratacionConsolidadoFila.update({ where: { id: f.id }, data: { edificio_id: nuevo, vinculo: v?.por ?? null } });
      if (v) n++;
    }
    return n;
  }
}
