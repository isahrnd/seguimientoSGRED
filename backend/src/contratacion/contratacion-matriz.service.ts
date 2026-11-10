import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { leerTablas } from './contratacion-excel';
import { identificadorLimpio, leerMatriz, normalizarId, vincularFila } from './contratacion-matriz';

type LeerBytes = (md5: string) => Promise<Buffer | null>;

export const CATEGORIA_MATRIZ = 'MATRIZ_CONTRATACION';

/**
 * Matriz de contratación en Excel: lectura directa por hoja, fila y celda (sin OCR ni API), una sola vez por versión del archivo,
 * y vínculo de cada fila con su expediente por proceso o contrato normalizados. La matriz es fuente común de varios contratos:
 * el documento no se asigna a un expediente. No crea contratos ni valores contractuales; el valor de la matriz se conserva como
 * «reportado en matriz», separado del valor corroborado por contrato y del ejecutado respaldado por acta.
 * Es idempotente: reindexar no duplica filas ni vínculos.
 */
@Injectable()
export class ContratacionMatrizService {
  private readonly log = new Logger(ContratacionMatrizService.name);
  constructor(private readonly prisma: PrismaService) {}

  async procesar(leer: LeerBytes): Promise<{ versiones: number; filas: number; vinculadas: number }> {
    const p = this.prisma;
    const res = { versiones: 0, filas: 0, vinculadas: 0 };

    // 1) Lectura de versiones de Excel aún no leídas. Cambia la huella → versión nueva → se lee de nuevo; la anterior se conserva.
    const candidatas = await p.contratacionDocumentoVersion.findMany({
      where: { matriz_lectura: null, vigente: true, origenes: { some: { estado: 'ACTIVO', mime: { contains: 'spreadsheetml' } } } },
      include: { documento: true, origenes: { where: { estado: 'ACTIVO' } } },
    });
    for (const v of candidatas) {
      try {
        const buf = await leer(v.md5);
        if (!buf) continue;
        const { filas, hojasLeidas } = leerMatriz(await leerTablas(buf));
        const origenId = v.origenes.find((o) => o.tipo === 'DRIVE')?.id_origen ?? v.origenes[0]?.id_origen ?? null;
        if (!filas.length) {
          await p.contratacionMatrizLectura.create({ data: { version_id: v.id, estado: 'NO_APLICA', origen_id: origenId } });
          continue;
        }
        await p.$transaction(async (tx: any) => {
          await tx.contratacionMatrizFila.createMany({
            data: filas.map((f) => ({
              version_id: v.id, hoja: f.hoja, fila: f.fila, tipo_hoja: f.tipo_hoja, proceso_original: f.proceso_original, contrato_original: f.contrato_original,
              proceso_norm: f.proceso_norm, contrato_norm: f.contrato_norm, modalidad: f.modalidad, objeto: f.objeto, valor: f.valor, estado: f.estado,
              contratista: f.contratista, secop_url: f.secop_url, celdas: f.celdas as any, alcance: f.alcance,
            })),
            skipDuplicates: true,
          });
          await tx.contratacionMatrizLectura.create({ data: { version_id: v.id, estado: 'MATRIZ', hojas: hojasLeidas.join(', '), filas: filas.length, origen_id: origenId } });
          // Fuente común: se clasifica por contenido, sin asignarla a un expediente. No pisa una categoría confirmada por una persona.
          if (v.documento.categoria === 'SIN_CATEGORIA' || v.documento.categoria === CATEGORIA_MATRIZ) {
            await tx.contratacionDocumento.update({ where: { id: v.documento_id }, data: { categoria: CATEGORIA_MATRIZ, estado_clasificacion: 'ASOCIADO' } });
          }
        });
        res.versiones++;
        res.filas += filas.length;
      } catch (e) {
        this.log.warn(`Sin lectura de matriz para una versión: ${(e as Error).message}`);
      }
    }

    // 2) Vínculos: se reevalúan siempre (un expediente puede llegar después que la matriz). Solo filas de versiones vigentes.
    res.vinculadas = await this.vincular();
    return res;
  }

  /** Vincula las filas vigentes con su expediente y completa lo que la matriz acredita (número de contrato; proceso de una ficha). */
  async vincular(): Promise<number> {
    const p = this.prisma;
    const filas = await p.contratacionMatrizFila.findMany({ where: { version: { vigente: true } }, orderBy: [{ tipo_hoja: 'asc' }, { fila: 'asc' }] });
    if (!filas.length) return 0;
    let vinculadas = 0;
    for (const f of filas) {
      const exps = await p.contratacionExpediente.findMany({ select: { id: true, proceso: true, numero_contrato: true, proceso_verificado: true } });
      const v = vincularFila(f, exps);
      const nuevo = v?.expedienteId ?? null;
      if (f.expediente_id !== nuevo || f.vinculo !== (v?.por ?? null)) {
        await p.contratacionMatrizFila.update({ where: { id: f.id }, data: { expediente_id: nuevo, vinculo: v?.por ?? null } });
      }
      if (!v) continue;
      vinculadas++;
      if (f.tipo_hoja !== 'COMPRAS') continue; // una adición modifica el contrato; no define su identidad
      const e = exps.find((x) => x.id === v.expedienteId)!;
      const data: Record<string, unknown> = {};
      const contrato = identificadorLimpio(f.contrato_original);
      if (!e.numero_contrato && contrato) data.numero_contrato = contrato;
      const proceso = identificadorLimpio(f.proceso_original);
      if (!e.proceso_verificado && proceso && normalizarId(e.proceso) !== normalizarId(proceso)) {
        const choque = exps.some((x) => x.id !== e.id && normalizarId(x.proceso) === normalizarId(proceso));
        if (!choque) { data.proceso = proceso; data.proceso_verificado = true; }
      }
      if (Object.keys(data).length) await p.contratacionExpediente.update({ where: { id: e.id }, data });
    }
    return vinculadas;
  }
}
