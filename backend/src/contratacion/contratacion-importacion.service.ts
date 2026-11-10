import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from 'libs/core/services/prisma.service';
import { validarImportacion } from './contratacion-importacion.validador';
import { normalizar } from './contratacion-sugerencias';
import { ContratacionDocumentosService } from './contratacion-documentos.service';
import { MAX_BYTES_EXCEL, leerCeldas } from './contratacion-excel';

export interface Cambio {
  proceso: string;
  entidad: string;
  clave: string;
  accion: 'CREAR' | 'ACTUALIZAR' | 'SIN_CAMBIOS';
  campos?: string[];
}

export interface VistaCambios {
  valida: boolean;
  errores: string[];
  advertencias: string[];
  hash: string;
  resumen: { crear: number; actualizar: number; sin_cambios: number };
  cambios: Cambio[];
}

const fecha = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T00:00:00Z` : s) : null);
const norm = (v: any): any => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
};

type Mapa = (r: any, ctx: { version: (f: any) => number | null; oferta: (c?: string) => number | null }) => Record<string, any>;

const KINDS: Array<{ lista: string; entidad: string; model: string; mapa: Mapa }> = [
  { lista: 'hechos', entidad: 'hecho', model: 'contratacionHecho', mapa: (r, x) => ({ tipo: r.tipo, titulo: r.titulo, detalle: r.detalle ?? null, atributos: r.atributos ?? null, version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
  { lista: 'ofertas', entidad: 'oferta', model: 'contratacionOferta', mapa: (r, x) => ({ proveedor: r.proveedor, grupo_oferta: r.grupo_oferta, revision: r.revision ?? 1, fecha_oferta: fecha(r.fecha_oferta), incluye: r.incluye ?? [], excluye: r.excluye ?? [], notas: r.notas ?? null, version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
  { lista: 'lineas', entidad: 'linea', model: 'contratacionLinea', mapa: (r, x) => ({ oferta_id: x.oferta(r.oferta), actividad: r.actividad, descripcion: r.descripcion, cantidad: r.cantidad ?? null, unidad: r.unidad, precio_unitario: r.precio_unitario ?? null, total: r.total ?? null, base_economica: r.base_economica, grupo_comparacion: r.grupo_comparacion ?? null, derivado: !!r.derivado, estado_revision: r.estado_revision ?? 'VERIFICADO', nota: r.nota ?? null, version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
  { lista: 'referencias', entidad: 'referencia', model: 'contratacionReferencia', mapa: (r, x) => ({ entidad: r.entidad, proveedor: r.proveedor ?? null, proceso_ref: r.proceso_ref ?? null, fecha: fecha(r.fecha), objeto: r.objeto, valor: r.valor ?? null, unidad: r.unidad ?? 'GLOBAL', condiciones: r.condiciones ?? null, version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
  { lista: 'valores', entidad: 'valor', model: 'contratacionValor', mapa: (r, x) => ({ oferta_id: x.oferta(r.oferta), tipo: r.tipo, concepto: r.concepto, importe: r.importe, estado_soporte: r.estado_soporte ?? 'RESPALDADO', version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
  { lista: 'contratos', entidad: 'contrato', model: 'contratacionContrato', mapa: (r, x) => ({ oferta_id: x.oferta(r.oferta), tipo_acto: r.tipo_acto, numero: r.numero ?? null, fecha_acto: fecha(r.fecha_acto), alcance: r.alcance ?? null, justificacion: r.justificacion ?? null, valor: r.valor, version_id: x.version(r.fuente), pagina: r.fuente?.pagina ?? null, hoja: r.fuente?.hoja ?? null, celda: r.fuente?.celda ?? null }) },
];

@Injectable()
export class ContratacionImportacionService {
  private readonly log = new Logger(ContratacionImportacionService.name);

  constructor(private readonly prisma: PrismaService, @Optional() private readonly documentos?: ContratacionDocumentosService) {}

  hash(payload: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /** Validación previa + vista de cambios. No escribe nada. */
  async previsualizar(payload: any): Promise<VistaCambios> {
    const hash = this.hash(payload);
    const v = validarImportacion(payload);
    const vacio = { crear: 0, actualizar: 0, sin_cambios: 0 };
    if (!v.datos) return { valida: false, errores: v.errores, advertencias: v.advertencias, hash, resumen: vacio, cambios: [] };
    try {
      const cambios = await this.ejecutar(this.prisma, v.datos.expedientes, false, undefined, v.datos.documentos, v.datos.edificios, v.datos.resoluciones);
      return { valida: true, errores: [], advertencias: v.advertencias, hash, resumen: this.resumir(cambios), cambios };
    } catch (e) {
      if (e instanceof BadRequestException) return { valida: false, errores: [String(e.message)], advertencias: v.advertencias, hash, resumen: vacio, cambios: [] };
      throw e;
    }
  }

  /** Aplicación atómica e idempotente: todo o nada. */
  async aplicar(payload: any, usuarioId: number | null) {
    const vista = await this.previsualizar(payload);
    if (!vista.valida) throw new BadRequestException({ message: 'Carga inválida; no se aplicó ningún cambio', errores: vista.errores });
    const datos = validarImportacion(payload).datos!;
    const cambios = vista.cambios.filter((c) => c.accion !== 'SIN_CAMBIOS');
    if (cambios.length === 0) return { aplicada: false, mensaje: 'Sin cambios: la carga ya estaba aplicada', resumen: vista.resumen };
    await this.prisma.$transaction(
      async (tx: any) => {
        const imp = await tx.contratacionImportacion.create({ data: { hash: vista.hash, estado: 'APLICADA', creado_por: usuarioId, resumen: vista.resumen as any } });
        const aplicados = await this.ejecutar(tx, datos.expedientes, true, imp.id, datos.documentos, datos.edificios, datos.resoluciones);
        void aplicados;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.registrarRespaldos(datos.expedientes);
    return { aplicada: true, resumen: vista.resumen };
  }

  /**
   * Guarda el valor actual de cada celda de Excel que respalda una cifra confirmada. Es la línea base para detectar
   * cambios cuando llegue una versión nueva del archivo. No se pisa un respaldo ya existente.
   */
  private async registrarRespaldos(expedientes: any[]) {
    if (!this.documentos) return;
    const porMd5 = new Map<string, Set<string>>();
    for (const e of expedientes) {
      for (const k of KINDS) {
        for (const r of e[k.lista]) {
          const f = r.fuente;
          if (f?.documento && f.hoja && f.celda) {
            const md5 = f.documento.toLowerCase();
            if (!porMd5.has(md5)) porMd5.set(md5, new Set());
            porMd5.get(md5)!.add(`${f.hoja}\u0000${f.celda}`);
          }
        }
      }
    }
    for (const [md5, refs] of porMd5) {
      try {
        const v = await this.prisma.contratacionDocumentoVersion.findUnique({ where: { md5 } });
        if (!v) continue;
        const lista = [...refs].map((x) => { const [hoja, celda] = x.split('\u0000'); return { hoja, celda }; });
        const { buf } = await this.documentos.leerBytes(v.id, MAX_BYTES_EXCEL);
        const valores = await leerCeldas(buf, lista);
        for (let i = 0; i < lista.length; i++) {
          await this.prisma.contratacionCeldaRespaldo.upsert({
            where: { version_id_hoja_celda: { version_id: v.id, hoja: lista[i].hoja, celda: lista[i].celda } },
            create: { version_id: v.id, hoja: lista[i].hoja, celda: lista[i].celda, valor: valores[i] },
            update: {},
          });
        }
      } catch (e) {
        this.log.warn(`No se pudo registrar el respaldo de celdas de una versión: ${(e as Error).message}`);
      }
    }
  }

  /** Crea o encuentra un edificio por nombre normalizado. En la vista previa no escribe. */
  private async edificio(db: any, nombre: string, direccion: string | null, escribir: boolean, cambios: Cambio[], proceso: string): Promise<number | null> {
    const nn = normalizar(nombre);
    const ex = await db.contratacionEdificio.findUnique({ where: { nombre_norm: nn } });
    if (ex) {
      if (escribir && direccion && !ex.direccion) await db.contratacionEdificio.update({ where: { id: ex.id }, data: { direccion } });
      return ex.id;
    }
    if (!cambios.some((c) => c.entidad === 'edificio' && c.clave === nombre)) cambios.push({ proceso, entidad: 'edificio', clave: nombre, accion: 'CREAR' });
    if (!escribir) return null;
    return (await db.contratacionEdificio.create({ data: { nombre, nombre_norm: nn, direccion } })).id;
  }

  private resumir(c: Cambio[]) {
    return {
      crear: c.filter((x) => x.accion === 'CREAR').length,
      actualizar: c.filter((x) => x.accion === 'ACTUALIZAR').length,
      sin_cambios: c.filter((x) => x.accion === 'SIN_CAMBIOS').length,
    };
  }

  private async ejecutar(db: any, expedientes: any[], escribir: boolean, importacionId?: number, documentos: any[] = [], edificios: any[] = [], resoluciones: any[] = []): Promise<Cambio[]> {
    const cambios: Cambio[] = [];
    const md5s = new Set<string>();
    for (const e of expedientes) for (const k of KINDS) for (const r of e[k.lista]) if (r.fuente?.documento) md5s.add(r.fuente.documento.toLowerCase());
    for (const d of documentos) md5s.add(d.documento.toLowerCase());
    for (const r of resoluciones) if (r.fuente?.documento) md5s.add(r.fuente.documento.toLowerCase());
    const vers = await db.contratacionDocumentoVersion.findMany({ where: { md5: { in: [...md5s] } }, select: { id: true, md5: true, documento_id: true } });
    const porMd5 = new Map<string, number>(vers.map((v: any) => [v.md5, v.id]));
    const faltan = [...md5s].filter((m) => !porMd5.has(m));
    if (faltan.length) throw new BadRequestException(`Documentos no indexados (actualice el índice antes de importar): ${faltan.length} huella(s) desconocida(s)`);

    const audita = async (entidad: string, clave: string, expId: number | null, accion: string, anterior: any, nuevo: any) => {
      if (escribir) await db.contratacionAuditoria.create({ data: { importacion_id: importacionId, entidad, clave, expediente_id: expId, accion, anterior: anterior ?? undefined, nuevo: nuevo ?? undefined } });
    };
    const jsonable = (o: any) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

    for (const e of expedientes) {
      const dataExp = { intervencion: e.intervencion, objeto: e.objeto ?? undefined, ...(e.alcance_confirmado ? { alcance_confirmado: e.alcance_confirmado } : {}), fecha_documento: fecha(e.fecha_documento) ?? undefined, ...(e.estado_documentado ? { estado_documentado: e.estado_documentado } : {}) };
      let exp = await db.contratacionExpediente.findUnique({ where: { proceso: e.proceso } });
      const difExp = exp ? Object.keys(dataExp).filter((k) => (dataExp as any)[k] !== undefined && norm((dataExp as any)[k]) !== norm(exp[k])) : [];
      cambios.push({ proceso: e.proceso, entidad: 'expediente', clave: e.proceso, accion: !exp ? 'CREAR' : difExp.length ? 'ACTUALIZAR' : 'SIN_CAMBIOS', campos: difExp });
      if (escribir && (!exp || difExp.length)) {
        const antes = exp ? jsonable(exp) : null;
        exp = exp ? await db.contratacionExpediente.update({ where: { id: exp.id }, data: dataExp }) : await db.contratacionExpediente.create({ data: { proceso: e.proceso, ...dataExp } });
        await audita('expediente', e.proceso, exp.id, antes ? 'ACTUALIZAR' : 'CREAR', antes, jsonable(exp));
      }
      const expId: number | null = exp?.id ?? null;
      const ofertaIds = new Map<string, number>();
      if (expId) for (const o of await db.contratacionOferta.findMany({ where: { expediente_id: expId }, select: { id: true, clave: true } })) ofertaIds.set(o.clave, o.id);
      const ctx = {
        version: (f: any) => (f?.documento ? porMd5.get(f.documento.toLowerCase()) ?? null : null),
        oferta: (c?: string) => (c ? ofertaIds.get(c) ?? null : null),
      };
      for (const k of KINDS) {
        for (const r of e[k.lista]) {
          const data = k.mapa(r, ctx);
          const existente = expId ? await db[k.model].findUnique({ where: { expediente_id_clave: { expediente_id: expId, clave: r.clave } } }) : null;
          const dif = existente ? Object.keys(data).filter((c) => norm(data[c]) !== norm(existente[c])) : [];
          const accion = !existente ? 'CREAR' : dif.length ? 'ACTUALIZAR' : 'SIN_CAMBIOS';
          cambios.push({ proceso: e.proceso, entidad: k.entidad, clave: r.clave, accion, campos: dif });
          if (!escribir || accion === 'SIN_CAMBIOS') continue;
          const filaNueva = existente
            ? await db[k.model].update({ where: { id: existente.id }, data })
            : await db[k.model].create({ data: { expediente_id: expId, clave: r.clave, ...data } });
          if (k.entidad === 'oferta') ofertaIds.set(r.clave, filaNueva.id);
          if (existente && dif.includes('version_id')) await db.contratacionAlertaCifra.updateMany({ where: { expediente_id: expId, entidad: k.entidad, clave: r.clave, estado: 'PENDIENTE' }, data: { estado: 'RESUELTA', resuelta_en: new Date() } });
          await audita(k.entidad, r.clave, expId, accion, existente ? jsonable(existente) : null, jsonable(filaNueva));
        }
      }
      // Edificios que cubre el proceso: los declarados y los hechos de tipo EDIFICACION (nombre antes de " – barrio").
      const nombres = new Map<string, string | null>();
      for (const n of e.edificios ?? []) nombres.set(n.trim(), null);
      for (const h of e.hechos) {
        if (h.tipo !== 'EDIFICACION') continue;
        const [base, ...resto] = String(h.titulo).split(/\s[–-]\s/);
        if (base.trim()) nombres.set(base.trim(), resto.join(' – ').trim() || null);
      }
      for (const [nombre, direccion] of nombres) {
        const edId = await this.edificio(db, nombre, direccion, escribir, cambios, e.proceso);
        if (!expId || !edId) { cambios.push({ proceso: e.proceso, entidad: 'expediente_edificio', clave: nombre, accion: 'CREAR' }); continue; }
        const enlace = await db.contratacionExpedienteEdificio.findUnique({ where: { expediente_id_edificio_id: { expediente_id: expId, edificio_id: edId } } });
        cambios.push({ proceso: e.proceso, entidad: 'expediente_edificio', clave: nombre, accion: enlace ? 'SIN_CAMBIOS' : 'CREAR' });
        if (escribir && !enlace) {
          await db.contratacionExpedienteEdificio.create({ data: { expediente_id: expId, edificio_id: edId, estado: 'CONFIRMADA' } });
          await audita('expediente_edificio', nombre, expId, 'CREAR', null, { edificio: nombre });
        }
      }
    }
    // Edificios consultables aunque aún no tengan contrato confirmado.
    for (const b of edificios) await this.edificio(db, b.nombre.trim(), b.direccion ?? null, escribir, cambios, '-');
    // Resoluciones de demolición: vinculadas al edificio o edificios que identifica el acto.
    for (const r of resoluciones) {
      const versionId = r.fuente?.documento ? porMd5.get(r.fuente.documento.toLowerCase()) ?? null : null;
      const datos = { fecha: fecha(r.fecha), tipo: r.tipo ?? 'DEMOLICION', estado_verificacion: r.estado_verificacion ?? 'VERIFICADA', version_id: versionId, pagina: r.fuente?.pagina ?? null };
      const previa = await db.contratacionResolucion.findUnique({ where: { numero: r.numero } });
      const dif = previa ? Object.keys(datos).filter((c) => norm((datos as any)[c]) !== norm(previa[c])) : [];
      cambios.push({ proceso: '-', entidad: 'resolucion', clave: r.numero, accion: !previa ? 'CREAR' : dif.length ? 'ACTUALIZAR' : 'SIN_CAMBIOS', campos: dif });
      let res = previa;
      if (escribir && (!previa || dif.length)) {
        res = previa ? await db.contratacionResolucion.update({ where: { id: previa.id }, data: datos }) : await db.contratacionResolucion.create({ data: { numero: r.numero, ...datos } });
        await audita('resolucion', r.numero, null, previa ? 'ACTUALIZAR' : 'CREAR', previa ? jsonable(previa) : null, jsonable(res));
      }
      for (const nombre of r.edificios) {
        const edId = await this.edificio(db, nombre.trim(), null, escribir, cambios, '-');
        if (!res || !edId) continue;
        const enlace = await db.contratacionResolucionEdificio.findUnique({ where: { resolucion_id_edificio_id: { resolucion_id: res.id, edificio_id: edId } } });
        if (!enlace && escribir) await db.contratacionResolucionEdificio.create({ data: { resolucion_id: res.id, edificio_id: edId } });
      }
    }
    // Confirmaciones documentales: no tocan importes; solo asociaciones verificadas por una persona.
    const docPorMd5 = new Map<string, number>(vers.map((v: any) => [v.md5, v.documento_id]));
    for (const d of documentos) {
      const docId = docPorMd5.get(d.documento.toLowerCase())!;
      for (const c of d.confirmaciones) {
        const clave = `${d.documento.toLowerCase()}:${c.tipo}:${c.valor}`;
        const previas = await db.contratacionDocSugerencia.findMany({ where: { documento_id: docId, tipo: c.tipo, valor: c.valor } });
        let yaConfirmado = previas.length > 0 && previas.every((s: any) => s.estado === 'CONFIRMADA');
        const doc = await db.contratacionDocumento.findUnique({ where: { id: docId }, include: { expediente: true } });
        if (c.evidencia) yaConfirmado = yaConfirmado && previas.every((s: any) => s.fuente_detalle === String(c.evidencia).trim());
        if (c.tipo === 'EXPEDIENTE') yaConfirmado = yaConfirmado && doc.expediente?.proceso === c.valor && doc.estado_clasificacion === 'CONFIRMADO';
        if (c.tipo === 'CATEGORIA') yaConfirmado = yaConfirmado && doc.categoria === c.valor;
        if (c.tipo === 'ALCANCE') yaConfirmado = yaConfirmado && doc.alcance === c.valor;
        if (c.tipo === 'EDIFICACION') {
          const ed = await db.contratacionEdificio.findUnique({ where: { nombre_norm: normalizar(c.valor) } });
          yaConfirmado = yaConfirmado && !!ed && !!(await db.contratacionDocumentoEdificio.findUnique({ where: { documento_id_edificio_id: { documento_id: docId, edificio_id: ed.id } } }));
        }
        const exp = c.tipo === 'EXPEDIENTE' ? await db.contratacionExpediente.findUnique({ where: { proceso: c.valor } }) : null;
        if (c.tipo === 'EXPEDIENTE' && !exp) throw new BadRequestException(`El expediente ${c.valor} no existe; cárguelo antes de confirmar documentos`);
        cambios.push({ proceso: c.tipo === 'EXPEDIENTE' ? c.valor : '-', entidad: 'documento', clave, accion: yaConfirmado ? 'SIN_CAMBIOS' : previas.length ? 'ACTUALIZAR' : 'CREAR' });
        if (!escribir || yaConfirmado) continue;
        // `evidencia`: aclaración aportada por el equipo (p. ej. «la oferta empresa uno de esta carpeta corresponde al Edificio Ejemplo»).
        const origen = c.evidencia ? { fuente_tipo: 'ACLARACION', fuente_detalle: String(c.evidencia).trim() } : { fuente_tipo: 'REVISION_PRIVADA', fuente_detalle: 'Confirmado en la importación privada' };
        if (previas.length) await db.contratacionDocSugerencia.updateMany({ where: { documento_id: docId, tipo: c.tipo, valor: c.valor }, data: { estado: 'CONFIRMADA', confirmada_en: new Date(), ...(c.evidencia ? origen : {}) } });
        else await db.contratacionDocSugerencia.create({ data: { documento_id: docId, tipo: c.tipo, valor: c.valor, ...origen, estado: 'CONFIRMADA', confirmada_en: new Date() } });
        if (c.tipo === 'EXPEDIENTE') await db.contratacionDocumento.update({ where: { id: docId }, data: { expediente_id: exp.id, estado_clasificacion: 'CONFIRMADO' } });
        if (c.tipo === 'CATEGORIA') await db.contratacionDocumento.update({ where: { id: docId }, data: { categoria: c.valor } });
        if (c.tipo === 'ALCANCE') await db.contratacionDocumento.update({ where: { id: docId }, data: { alcance: c.valor } });
        if (c.tipo === 'EDIFICACION') {
          const edId = await this.edificio(db, c.valor.trim(), null, true, [], '-');
          await db.contratacionDocumentoEdificio.upsert({ where: { documento_id_edificio_id: { documento_id: docId, edificio_id: edId! } }, create: { documento_id: docId, edificio_id: edId! }, update: {} });
        }
        await audita('documento', clave, exp?.id ?? null, previas.length ? 'ACTUALIZAR' : 'CREAR', previas.length ? jsonable(previas) : null, { tipo: c.tipo, valor: c.valor, estado: 'CONFIRMADA' });
      }
    }
    return cambios;
  }
}
