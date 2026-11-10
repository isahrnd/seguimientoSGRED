import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { decidir, extraerContrato, puntuar, ExpedienteCandidato, ContratoExtraido } from './contratacion-contratos';

type LeerPaginas = (versionId: number, md5: string) => Promise<string[] | null>;

const PREFIJO_FICHA = 'CONTRATO-';

/**
 * Ingesta de contratos en PDF: lee el encabezado y la cláusula de valor (sin OCR: solo PDF con texto), corrobora la relación
 * con un expediente por consecutivo, año, contratista y objeto, y registra el contrato SIN tocar la selección de oferta ni la
 * ejecución (esas siguen exigiendo sus propios soportes). Ante ambigüedad deja el documento en revisión.
 * Es idempotente: una versión ya leída no se vuelve a leer y un contrato se identifica por su número.
 */
@Injectable()
export class ContratacionContratosService {
  private readonly log = new Logger(ContratacionContratosService.name);
  constructor(private readonly prisma: PrismaService) {}

  async procesar(leer: LeerPaginas): Promise<{ leidos: number; asociados: number; fichas: number; revision: number }> {
    const p = this.prisma;
    const res = { leidos: 0, asociados: 0, fichas: 0, revision: 0 };

    // 1) Lectura: versiones PDF cuyo contenido indexado tiene el encabezado de un contrato y que aún no se leyeron.
    //    Solo por contenido (el texto indexado conserva los espacios que algunos PDF meten dentro de las palabras, «CONTRA TO No»);
    //    el nombre del archivo no decide ni basta.
    const candidatas = await p.contratacionDocumentoVersion.findMany({
      where: {
        doc_contrato: null,
        origenes: { some: { estado: 'ACTIVO', mime: 'application/pdf' } },
        AND: [
          { indice: { OR: [{ texto: { contains: 'contrato no' } }, { texto: { contains: 'contra to no' } }] } },
          { indice: { OR: [{ texto: { contains: 'contratista' } }, { texto: { contains: 'contra tista' } }] } },
          // El índice guarda el texto normalizado (sin signos): «objeto:» queda como «objeto» (o «objet o»).
          { indice: { OR: [{ texto: { contains: 'objeto' } }, { texto: { contains: 'objet o' } }] } },
        ],
      },
      include: { documento: true },
    });
    for (const v of candidatas) {
      try {
        const paginas = await leer(v.id, v.md5);
        if (!paginas) continue;
        const c = extraerContrato(paginas);
        if (!c) {
          await p.contratacionDocContrato.create({ data: { version_id: v.id, estado: 'NO_APLICA', motivo: 'La página 1 no es el encabezado de un contrato.' } });
          continue;
        }
        res.leidos++;
        await p.contratacionDocContrato.create({
          data: {
            version_id: v.id, estado: 'EN_REVISION', numero_contrato: c.numero_contrato, consecutivo: c.consecutivo, anio: c.anio, contratista: c.contratista,
            objeto: c.objeto, valor: c.valor, expresion_valor: c.expresion_valor, valor_clausula: c.valor_clausula, proceso_citado: c.proceso_citado,
            firma_estado: c.firma.estado, firma_detalle: c.firma.detalle, firma_fecha: c.firma.fecha ? new Date(`${c.firma.fecha}T00:00:00Z`) : null,
            advertencias: c.advertencias as any,
          },
        });
        // Clasificación por contenido: un contrato con nombre ambiguo (p. ej. «COMPLEMENTO.pdf») queda en su categoría.
        await p.contratacionDocumento.update({
          where: { id: v.documento_id },
          data: { categoria: 'CONTRATACION_ACTAS', fecha_documento: c.firma.fecha ? new Date(`${c.firma.fecha}T00:00:00Z`) : v.documento.fecha_documento },
        });
      } catch (e) {
        this.log.warn(`Sin lectura de contrato para una versión: ${(e as Error).message}`);
      }
    }

    // 2) Decisión sobre las lecturas pendientes o en revisión (se reevalúan si llega un expediente nuevo).
    const pendientes = await p.contratacionDocContrato.findMany({ where: { estado: 'EN_REVISION' }, include: { version: true } });
    if (pendientes.length) {
      const exps = await p.contratacionExpediente.findMany({ include: { ofertas: { select: { proveedor: true } } } });
      const cand: ExpedienteCandidato[] = exps.map((e) => ({
        id: e.id, proceso: e.proceso, numero_contrato: e.numero_contrato, intervencion: e.intervencion, objeto: e.objeto,
        proveedores: [...new Set(e.ofertas.map((o) => o.proveedor))],
      }));
      for (const r of pendientes) {
        const c = this.desdeFila(r);
        const adv = (r.advertencias as string[] | null) ?? [];
        if (adv.some((a) => /no coincide/.test(a))) {
          await this.aRevision(r.version_id, 'El valor del encabezado no coincide con el de la cláusula de valor.', []);
          res.revision++;
          continue;
        }
        const d = decidir(puntuar(c, cand));
        if (d.tipo === 'ASOCIAR') {
          await this.registrar(r.version_id, r.version.documento_id, d.expedienteId, c, 'ASOCIADO', d.razones.join('; '));
          res.asociados++;
        } else if (d.tipo === 'NUEVA_FICHA') {
          const ficha = await this.fichaPorContrato(c);
          await this.registrar(r.version_id, r.version.documento_id, ficha, c, 'FICHA_CREADA', d.motivo);
          res.fichas++;
        } else {
          await this.aRevision(r.version_id, d.motivo, d.candidatos);
          res.revision++;
        }
      }
    }
    return res;
  }

  private desdeFila(r: any): ContratoExtraido {
    return {
      numero_contrato: r.numero_contrato, consecutivo: r.consecutivo, anio: r.anio, contratista: r.contratista ?? '', objeto: r.objeto ?? '', valor: Number(r.valor),
      expresion_valor: r.expresion_valor ?? 'valor del contrato', pagina_valor: 1, valor_clausula: r.valor_clausula === null ? null : Number(r.valor_clausula), pagina_clausula: null,
      proceso_citado: r.proceso_citado, firma: { estado: r.firma_estado, detalle: r.firma_detalle ?? '', fecha: r.firma_fecha ? r.firma_fecha.toISOString().slice(0, 10) : null, pagina: null },
      advertencias: (r.advertencias as string[] | null) ?? [],
    };
  }

  /** Ficha identificada por su número contractual; el número de proceso queda pendiente de verificar. */
  private async fichaPorContrato(c: ContratoExtraido): Promise<number> {
    const p = this.prisma;
    const existente = await p.contratacionExpediente.findFirst({ where: { numero_contrato: c.numero_contrato } });
    if (existente) return existente.id;
    const intervencion = c.objeto.replace(/^(CONTRATAR|EJECUTAR)\s+/i, '').replace(/\s+/g, ' ').trim();
    const corta = (intervencion.charAt(0).toUpperCase() + intervencion.slice(1).toLowerCase()).slice(0, 160);
    const e = await p.contratacionExpediente.create({
      data: {
        proceso: `${PREFIJO_FICHA}${c.numero_contrato}`, tipo: 'OTRA', intervencion: corta, objeto: c.objeto, numero_contrato: c.numero_contrato, proceso_verificado: false,
        estado_documentado: 'CONTRATADO', fecha_documento: c.firma.fecha ? new Date(`${c.firma.fecha}T00:00:00Z`) : null,
      },
    });
    return e.id;
  }

  private async registrar(versionId: number, documentoId: number, expedienteId: number, c: ContratoExtraido, estado: 'ASOCIADO' | 'FICHA_CREADA', motivo: string) {
    const p = this.prisma;
    await p.$transaction(async (tx: any) => {
      await tx.contratacionExpediente.update({ where: { id: expedienteId }, data: { numero_contrato: c.numero_contrato } });
      const datos = {
        oferta_id: null, // la selección de oferta tiene sus propios soportes
        tipo_acto: 'CONTRATO', numero: c.numero_contrato, fecha_acto: c.firma.fecha ? new Date(`${c.firma.fecha}T00:00:00Z`) : null,
        alcance: c.objeto, justificacion: null, valor: c.valor, version_id: versionId, pagina: 1, contratista: c.contratista.replace(/\s+/g, ' ').trim(),
        expresion_valor: c.expresion_valor, firma_estado: c.firma.estado, firma_detalle: c.firma.detalle,
        firma_fecha: c.firma.fecha ? new Date(`${c.firma.fecha}T00:00:00Z`) : null, numero_proceso_citado: c.proceso_citado,
      };
      const clave = `contrato:${c.numero_contrato}`;
      await tx.contratacionContrato.upsert({ where: { expediente_id_clave: { expediente_id: expedienteId, clave } }, create: { expediente_id: expedienteId, clave, ...datos }, update: datos });
      await tx.contratacionDocumento.update({ where: { id: documentoId }, data: { expediente_id: expedienteId, estado_clasificacion: 'ASOCIADO', categoria: 'CONTRATACION_ACTAS' } });
      await tx.contratacionDocContrato.update({ where: { version_id: versionId }, data: { estado, expediente_id: expedienteId, motivo, candidatos: null } });
    });
  }

  private async aRevision(versionId: number, motivo: string, candidatos: { id: number; puntaje: number; razones: string[] }[]) {
    const p = this.prisma;
    await p.contratacionDocContrato.update({ where: { version_id: versionId }, data: { estado: 'EN_REVISION', motivo, candidatos: candidatos as any } });
    const v = await p.contratacionDocumentoVersion.findUnique({ where: { id: versionId } });
    if (!v) return;
    for (const c of candidatos) {
      const e = await p.contratacionExpediente.findUnique({ where: { id: c.id } });
      if (!e) continue;
      await p.contratacionDocSugerencia.upsert({
        where: { documento_id_tipo_valor_fuente_tipo_fuente_detalle: { documento_id: v.documento_id, tipo: 'EXPEDIENTE', valor: e.proceso, fuente_tipo: 'PDF_PAGINA', fuente_detalle: 'Contrato (pág. 1): coincidencia parcial' } },
        create: { documento_id: v.documento_id, tipo: 'EXPEDIENTE', valor: e.proceso, fuente_tipo: 'PDF_PAGINA', fuente_detalle: 'Contrato (pág. 1): coincidencia parcial' },
        update: {},
      });
    }
  }
}
