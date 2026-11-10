/**
 * Pruebas de integración con datos FICTICIOS contra una BD desechable.
 * Se ejecutan solo si CONTRATACION_TEST_DATABASE_URL apunta a una BD local
 * (127.0.0.1/localhost) que tenga aplicada la migración del módulo.
 * Se vacían únicamente las tablas tbl_contratacion_*.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { PrismaClient } from '@prisma/client';
import { ContratacionIndiceService } from './contratacion-indice.service';
import { ContratacionImportacionService } from './contratacion-importacion.service';
import { ContratacionConsultaService } from './contratacion-consulta.service';
import { ContratacionDocumentosService } from './contratacion-documentos.service';
import { ContratacionBibliotecaService } from './contratacion-biblioteca.service';
import { ContratacionEdificiosService } from './contratacion-edificios.service';
import { ContratacionSincronizacionService } from './contratacion-sincronizacion.service';
import { DriveArchivo, DriveClient } from './contratacion-drive.client';

const URL = process.env.CONTRATACION_TEST_DATABASE_URL;
const habilitado = !!URL && /@(127\.0\.0\.1|localhost)[:/]/.test(URL);
const d = habilitado ? describe : describe.skip;

function pdf(texto: string): Buffer {
  const stream = `BT /F1 12 Tf 50 700 Td (${texto.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  // Huella distinta en los primeros bytes: pdf.js cachea los documentos por esa huella.
  let out = '%PDF-1.4\n%' + crypto.createHash('md5').update(texto).digest('hex').repeat(40) + '\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const md5 = (b: Buffer) => crypto.createHash('md5').update(b).digest('hex');
const PROC = '9999.001.32.1.001-2030';
const analisis = (extra = '') => pdf(`ANALISIS DEL SECTOR Fecha: 01/02/2030 Numero del proceso: ${PROC} ${extra}`);

class DriveFalso implements DriveClient {
  archivos = new Map<string, { meta: DriveArchivo; bytes: Buffer }>();
  caido = false;
  puesto = true;
  configurado() { return this.puesto; }
  poner(id: string, name: string, bytes: Buffer, extra: Partial<DriveArchivo> = {}) {
    this.archivos.set(id, { bytes, meta: { id, name, mimeType: 'application/pdf', md5Checksum: md5(bytes), size: String(bytes.length), parents: ['RAIZFALSA1234'], ...extra } });
  }
  async listarCarpeta(carpeta: string) {
    if (this.caido) throw new Error('Drive: error de conexión');
    return { archivos: [...this.archivos.values()].filter((a) => a.meta.parents?.includes(carpeta) && !a.meta.trashed).map((a) => a.meta) };
  }
  async obtener(id: string) {
    if (this.caido) throw new Error('Drive: error de conexión');
    return this.archivos.get(id)?.meta ?? null;
  }
  async descargar(id: string) {
    const a = this.archivos.get(id)!;
    return { status: 200, headers: { 'content-length': String(a.bytes.length) }, stream: Readable.from([a.bytes]) };
  }
}

function resFalsa() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const { Writable } = require('stream');
  const w = new Writable({ write(c: any, _e: any, cb: any) { chunks.push(Buffer.from(c)); cb(); } });
  Object.assign(w, { statusCode: 200, status(n: number) { w.statusCode = n; return w; }, setHeader(k: string, v: string) { headers[k] = v; } });
  return { res: w as any, headers, cuerpo: () => Buffer.concat(chunks) };
}

d('Monitoreo de contratación (integración, datos ficticios)', () => {
  let prisma: PrismaClient;
  let dir: string;
  let drive: DriveFalso;
  let indice: ContratacionIndiceService;
  let importacion: ContratacionImportacionService;
  let consulta: ContratacionConsultaService;
  let docs: ContratacionDocumentosService;
  let biblio: ContratacionBibliotecaService;
  let edificios: ContratacionEdificiosService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL! } }, log: [] });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-int-'));
    process.env.SEGUIMIENTO_DOCS_DIR = dir;
    process.env.SEGUIMIENTO_DRIVE_ROOT_ID = 'RAIZFALSA1234';
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE tbl_contratacion_doc_sugerencias, tbl_contratacion_doc_indice, tbl_contratacion_auditoria, tbl_contratacion_importaciones, tbl_contratacion_contratos, tbl_contratacion_valores, tbl_contratacion_referencias, tbl_contratacion_lineas, tbl_contratacion_ofertas, tbl_contratacion_hechos, tbl_contratacion_fuentes_estado, tbl_contratacion_doc_origenes, tbl_contratacion_doc_versiones, tbl_contratacion_documentos, tbl_contratacion_expedientes, tbl_contratacion_edificios, tbl_contratacion_resoluciones, tbl_contratacion_alertas_cifra, tbl_contratacion_celdas_respaldo RESTART IDENTITY CASCADE`);
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true, recursive: true });
    drive = new DriveFalso();
    indice = new ContratacionIndiceService(prisma as any, drive);
    importacion = new ContratacionImportacionService(prisma as any);
    edificios = new ContratacionEdificiosService(prisma as any);
    consulta = new ContratacionConsultaService(prisma as any, edificios);
    docs = new ContratacionDocumentosService(prisma as any, drive);
    importacion = new ContratacionImportacionService(prisma as any, docs);
    biblio = new ContratacionBibliotecaService(prisma as any, docs);
  });

  const cuenta = async () => ({
    docs: await prisma.contratacionDocumento.count(),
    vers: await prisma.contratacionDocumentoVersion.count(),
    orig: await prisma.contratacionDocumentoOrigen.count(),
    exps: await prisma.contratacionExpediente.count(),
  });

  it('reindexar dos veces no duplica; el expediente se crea solo desde el número de proceso', async () => {
    fs.writeFileSync(path.join(dir, 'x.pdf'), analisis());
    await indice.reindexar();
    const a = await cuenta();
    await indice.reindexar();
    expect(await cuenta()).toEqual(a);
    expect(a).toEqual({ docs: 1, vers: 1, orig: 1, exps: 1 });
    const doc = await prisma.contratacionDocumento.findFirstOrThrow();
    expect(doc.estado_clasificacion).toBe('ASOCIADO');
  });

  it('el mismo PDF en local y Drive: un solo documento con ambos orígenes', async () => {
    const b = analisis();
    fs.writeFileSync(path.join(dir, 'a.pdf'), b);
    drive.poner('F1', 'copia.pdf', b);
    await indice.reindexar();
    expect(await cuenta()).toEqual({ docs: 1, vers: 1, orig: 2, exps: 1 });
    const lista = await consulta.listar({});
    expect(lista.expedientes).toHaveLength(1);
  });

  it('un documento sin proceso queda pendiente de clasificación', async () => {
    fs.writeFileSync(path.join(dir, 'suelto.pdf'), pdf('texto cualquiera'));
    await indice.reindexar();
    expect((await consulta.pendientes())).toHaveLength(1);
    expect((await consulta.listar({})).documentos_pendientes_clasificacion).toBe(1);
  });

  it('una nueva versión conserva el vínculo con las cifras anteriores', async () => {
    const v1 = analisis('v1');
    fs.writeFileSync(path.join(dir, 'a.pdf'), v1);
    await indice.reindexar();
    const payload = {
      version: 1,
      expedientes: [{ proceso: PROC, intervencion: 'Prueba', valores: [{ clave: 'v', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'c', importe: 1000, fuente: { documento: md5(v1), pagina: 1 } }] }],
    };
    await importacion.aplicar(payload, 1);
    fs.writeFileSync(path.join(dir, 'a.pdf'), analisis('v2'));
    await indice.reindexar();
    const vers = await prisma.contratacionDocumentoVersion.findMany({ orderBy: { numero: 'asc' } });
    expect(vers.map((v) => [v.numero, v.vigente])).toEqual([[1, false], [2, true]]);
    expect(await prisma.contratacionDocumento.count()).toBe(1);
    const det: any = await consulta.detalle((await prisma.contratacionExpediente.findFirstOrThrow()).id);
    const valor = det.valores[0];
    expect(valor.soporte.numero_version).toBe(1);
    expect(valor.soporte.es_vigente).toBe(false);
    expect(valor.soporte.version_vigente_id).toBe(vers[1].id);
  });

  it('un documento retirado de Drive deja de servirse desde ese origen; la copia local lo reemplaza', async () => {
    const b = analisis();
    drive.poner('F1', 'copia.pdf', b);
    await indice.reindexar();
    const ver = await prisma.contratacionDocumentoVersion.findFirstOrThrow();
    let r = resFalsa();
    await docs.servir(ver.id, undefined, r.res);
    expect(r.headers['X-Origen-Documento']).toBe('DRIVE');
    drive.archivos.get('F1')!.meta.trashed = true; // enviado a papelera
    await expect(docs.servir(ver.id, undefined, resFalsa().res)).rejects.toThrow(/ya no está disponible/);
    await indice.reindexar();
    expect((await prisma.contratacionDocumentoOrigen.findFirstOrThrow()).estado).toBe('RETIRADO');
    // alternativa local autorizada
    fs.writeFileSync(path.join(dir, 'a.pdf'), b);
    await indice.reindexar();
    r = resFalsa();
    await docs.servir(ver.id, undefined, r.res);
    expect(r.headers['X-Origen-Documento']).toBe('LOCAL');
    expect(r.cuerpo().equals(b)).toBe(true);
  });

  it('archivo de Drive fuera de la raíz o con contenido distinto no se entrega', async () => {
    const b = analisis();
    drive.poner('F1', 'copia.pdf', b);
    await indice.reindexar();
    const ver = await prisma.contratacionDocumentoVersion.findFirstOrThrow();
    drive.archivos.get('F1')!.meta.parents = ['OTRACARPETA999'];
    await expect(docs.servir(ver.id, undefined, resFalsa().res)).rejects.toThrow();
    drive.archivos.get('F1')!.meta.parents = ['RAIZFALSA1234'];
    drive.archivos.get('F1')!.meta.md5Checksum = 'f'.repeat(32);
    await expect(docs.servir(ver.id, undefined, resFalsa().res)).rejects.toThrow();
  });

  it('una caída de Drive deja operativos los PDF locales y no retira ni borra nada', async () => {
    const b = analisis();
    fs.writeFileSync(path.join(dir, 'a.pdf'), b);
    drive.poner('F1', 'copia.pdf', b);
    await indice.reindexar();
    drive.caido = true;
    const r = await indice.reindexar();
    expect(r.drive.estado).toBe('ERROR');
    expect(r.local.estado).toBe('CORRECTA');
    expect(await prisma.contratacionDocumentoOrigen.count({ where: { estado: 'ACTIVO' } })).toBe(2);
    const fu = await consulta.fuentes();
    expect(fu.find((x) => x.tipo === 'DRIVE')!.estado).toBe('ERROR');
    const ver = await prisma.contratacionDocumentoVersion.findFirstOrThrow();
    const res = resFalsa();
    await docs.servir(ver.id, undefined, res.res);
    expect(res.headers['X-Origen-Documento']).toBe('LOCAL');
  });

  it('distingue fuente vacía de error y de sin configurar', async () => {
    drive.puesto = false;
    const r = await indice.reindexar();
    expect(r.local.estado).toBe('VACIA');
    expect(r.drive.estado).toBe('SIN_CONFIGURAR');
  });

  it('entrega parcial (Range) de un PDF local', async () => {
    const b = analisis();
    fs.writeFileSync(path.join(dir, 'a.pdf'), b);
    await indice.reindexar();
    const ver = await prisma.contratacionDocumentoVersion.findFirstOrThrow();
    const r = resFalsa();
    await docs.servir(ver.id, 'bytes=0-9', r.res);
    expect(r.res.statusCode).toBe(206);
    expect(r.cuerpo().equals(b.subarray(0, 10))).toBe(true);
    expect(r.headers['Content-Range']).toBe(`bytes 0-9/${b.length}`);
  });

  it('una versión inexistente o manipulada no entrega nada', async () => {
    await expect(docs.servir(99999, undefined, resFalsa().res)).rejects.toThrow();
  });

  describe('importación y totales', () => {
    const base = async () => {
      const b = analisis();
      fs.writeFileSync(path.join(dir, 'a.pdf'), b);
      await indice.reindexar();
      return md5(b);
    };
    const F = (m: string, p = 1) => ({ documento: m, pagina: p });

    it('es idempotente y no duplica importes', async () => {
      const m = await base();
      const p = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'Prueba', valores: [{ clave: 'v', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'c', importe: 500, fuente: F(m) }] }] };
      const a = await importacion.aplicar(p, 1);
      const b = await importacion.aplicar(p, 1);
      expect(a.aplicada).toBe(true);
      expect(b.aplicada).toBe(false);
      expect(await prisma.contratacionValor.count()).toBe(1);
      expect(await prisma.contratacionImportacion.count()).toBe(1);
    });

    it('una carga inválida no deja datos parciales', async () => {
      const m = await base();
      const p = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'Prueba', hechos: [{ clave: 'h', tipo: 'ACTIVIDAD', titulo: 't', fuente: F(m) }], valores: [{ clave: 'v', tipo: 'EJECUTADO', concepto: 'c', importe: -1, fuente: F(m) }] }] };
      await expect(importacion.aplicar(p, 1)).rejects.toThrow();
      expect(await prisma.contratacionHecho.count()).toBe(0);
    });

    it('rechaza fuentes (huellas) no indexadas', async () => {
      await base();
      const p = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'P', valores: [{ clave: 'v', tipo: 'COTIZADO', concepto: 'c', importe: 5, fuente: F('b'.repeat(32)) }] }] };
      const v = await importacion.previsualizar(p);
      expect(v.valida).toBe(false);
    });

    it('corregir una cifra conserva la trazabilidad en la auditoría', async () => {
      const m = await base();
      const mk = (imp: number) => ({ version: 1, expedientes: [{ proceso: PROC, intervencion: 'P', valores: [{ clave: 'v', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'c', importe: imp, fuente: F(m) }] }] });
      await importacion.aplicar(mk(100), 1);
      await importacion.aplicar(mk(120), 1);
      const aud = await prisma.contratacionAuditoria.findMany({ where: { entidad: 'valor' }, orderBy: { id: 'asc' } });
      expect(aud.map((x) => x.accion)).toEqual(['CREAR', 'ACTUALIZAR']);
      expect(Number((aud[1].anterior as any).importe)).toBe(100);
    });

    it('una cotización sin contrato firmado no aumenta el total contratado; un contrato cuenta una vez', async () => {
      const m = await base();
      const sin = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'P', ofertas: [{ clave: 'o', proveedor: 'Empresa X', grupo_oferta: 'g', fuente: F(m) }], valores: [{ clave: 'c', tipo: 'COTIZADO', concepto: 'cot', importe: 900, oferta: 'o', fuente: F(m) }] }] };
      await importacion.aplicar(sin, 1);
      let l = await consulta.listar({});
      expect(l.totales.contratado).toBeNull();
      expect(l.expedientes[0].valores.contratado).toBeNull();
      expect(l.expedientes[0].valores.cotizado).toEqual({ min: 900, max: 900 });
      expect(l.expedientes[0].empresa_seleccionada).toBeNull();
      const con = JSON.parse(JSON.stringify(sin));
      con.expedientes[0].contratos = [{ clave: 'k1', tipo_acto: 'Contrato', valor: 850, oferta: 'o', fuente: F(m, 2) }];
      await importacion.aplicar(con, 1);
      await importacion.aplicar(con, 1);
      l = await consulta.listar({});
      expect(l.totales.contratado).toBe(850);
      expect(l.totales.contratos).toBe(1);
      expect(l.expedientes[0].empresa_seleccionada).toBe('Empresa X');
      expect(l.expedientes[0].estado).toBe('CONTRATADO');
    });

    it('un contrato que abarca varias edificaciones no repite ni reparte el importe', async () => {
      const m = await base();
      const p = {
        version: 1,
        expedientes: [{ proceso: PROC, intervencion: 'P',
          hechos: ['A', 'B', 'C'].map((x) => ({ clave: `e${x}`, tipo: 'EDIFICACION', titulo: `Edif ${x}`, fuente: F(m) })),
          contratos: [{ clave: 'k', tipo_acto: 'Contrato', valor: 3000, fuente: F(m) }] }],
      };
      await importacion.aplicar(p, 1);
      const l = await consulta.listar({});
      expect(l.expedientes[0].edificaciones).toHaveLength(3);
      expect(l.totales.contratado).toBe(3000);
    });

    it('el valor ejecutado citado sin acta no se suma como ejecutado', async () => {
      const m = await base();
      const p = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'P', valores: [{ clave: 'e', tipo: 'EJECUTADO', concepto: 'acta citada', importe: 700, estado_soporte: 'CITADO_SIN_ACTA', fuente: F(m) }] }] };
      await importacion.aplicar(p, 1);
      const l = await consulta.listar({});
      expect(l.expedientes[0].valores.ejecutado).toBeNull();
    });

    it('referencia de valor global no se compara con precios unitarios', async () => {
      const m = await base();
      const p = { version: 1, expedientes: [{ proceso: PROC, intervencion: 'P', referencias: [{ clave: 'r', entidad: 'Otra entidad', objeto: 'Contrato global', valor: 5_000_000, unidad: 'GLOBAL', fuente: F(m) }] }] };
      await importacion.aplicar(p, 1);
      const det: any = await consulta.detalle((await prisma.contratacionExpediente.findFirstOrThrow()).id);
      expect(det.analisis_sector.referencias[0].comparacion.comparable).toBe(false);
    });
  });

  describe('biblioteca documental', () => {
    const subir = (rel: string, bytes: Buffer) => {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    };
    const xlsxFicticio = async (celda = 'Edificio Prueba Alfa') => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Hoja1');
      ws.addRow(['Concepto', celda]);
      ws.getCell('B2').value = { formula: 'A1&"x"', result: 'resultado' };
      return Buffer.from(await wb.xlsx.writeBuffer());
    };

    it('busca por edificación, carpeta y empresa; conteos reales; categoría sin contrato', async () => {
      subir('1. EDIF PRUEBA ALFA/COTIZACIONES/2. EMPRESA UNO.pdf', pdf('cotizacion sin proceso alfa'));
      subir('1. EDIF PRUEBA ALFA/SOPORTES TECNICOS/evaluacion_ATC20_alfa.pdf', pdf('evaluacion tecnica sin proceso'));
      subir('2. OTRO PREDIO/RESOLUCION No. 1111.002.21.1.316 DE 2030.pdf', pdf('resolucion sin proceso'));
      subir('Cuadro suelto.xlsx', await xlsxFicticio());
      await indice.reindexar();
      const todos = await biblio.listar({});
      expect(todos.conteos).toEqual({ todos: 4, revisar: 4, clasificados: 0, generales: 0 });
      const porEdif = await biblio.listar({ q: 'alfa' });
      expect(porEdif.items.map((i) => i.nombre).sort()).toEqual(['2. EMPRESA UNO.pdf', 'Cuadro suelto.xlsx', 'evaluacion_ATC20_alfa.pdf'].sort());
      expect((await biblio.listar({ q: 'empresa uno' })).total).toBe(1);
      const ev = (await biblio.listar({ q: 'atc20' })).items[0];
      expect(ev.categoria).toMatchObject({ codigo: 'VISITA_SOPORTE_TECNICO', origen: 'detectada' });
      expect(ev.expediente).toBeNull();
      expect((await biblio.listar({ formato: 'XLSX' })).total).toBe(1);
      expect((await biblio.listar({ edificacion: 'edif prueba alfa' })).total).toBe(2);
    });

    it('una sugerencia no confirma nada ni modifica importes', async () => {
      subir('1. EDIF PRUEBA ALFA/COTIZACIONES/2. EMPRESA UNO.pdf', pdf('cotizacion sin proceso'));
      await indice.reindexar();
      expect(await prisma.contratacionDocumento.count({ where: { expediente_id: { not: null } } })).toBe(0);
      expect(await prisma.contratacionValor.count()).toBe(0);
      expect(await prisma.contratacionContrato.count()).toBe(0);
      expect((await consulta.listar({})).totales.contratado).toBeNull();
    });

    it('confirmar una asociación sobrevive a reindexar, no duplica y el documento sigue en Todos', async () => {
      fs.writeFileSync(path.join(dir, 'a.pdf'), analisis('base'));
      subir('1. EDIF PRUEBA ALFA/COTIZACIONES/2. EMPRESA UNO.pdf', pdf('cotizacion sin proceso otra'));
      await indice.reindexar();
      const cot = await prisma.contratacionDocumento.findFirstOrThrow({ where: { nombre: '2. EMPRESA UNO.pdf' }, include: { versiones: true } });
      const payload = { version: 1, documentos: [{ documento: cot.versiones[0].md5, confirmaciones: [{ tipo: 'EXPEDIENTE', valor: PROC }, { tipo: 'EDIFICACION', valor: 'EDIF PRUEBA ALFA' }] }] };
      const vp = (await importacion.previsualizar(payload)).resumen;
      expect([vp.crear, vp.actualizar]).toEqual([1, 1]); // expediente: crea; edificación: confirma la sugerencia existente
      await importacion.aplicar(payload, 1);
      const antes = { docs: await prisma.contratacionDocumento.count(), sug: await prisma.contratacionDocSugerencia.count() };
      await indice.reindexar();
      await indice.reindexar();
      expect({ docs: await prisma.contratacionDocumento.count(), sug: await prisma.contratacionDocSugerencia.count() }).toEqual(antes);
      const lista = await biblio.listar({});
      const item = lista.items.find((i) => i.nombre === '2. EMPRESA UNO.pdf')!;
      expect(item.expediente).toMatchObject({ proceso: PROC, confirmado: true });
      expect(item.clasificado).toBe(true);
      expect(item.edificaciones.find((e) => e.valor === 'EDIF PRUEBA ALFA')!.estado).toBe('CONFIRMADA');
      expect(lista.conteos.clasificados).toBe(2);
      const exp = await prisma.contratacionExpediente.findFirstOrThrow();
      expect((await biblio.listar({ expediente: String(exp.id) })).total).toBe(2);
      expect((await consulta.detalle(exp.id)).soportes.map((s: any) => s.nombre)).toContain('2. EMPRESA UNO.pdf');
      expect((await importacion.aplicar(payload, 1)).aplicada).toBe(false);
    });

    it('vista previa de hoja: celdas como datos, sin fórmulas; solo para hojas de cálculo', async () => {
      subir('Cuadro.xlsx', await xlsxFicticio());
      subir('a.pdf', pdf('texto'));
      await indice.reindexar();
      const xl = await prisma.contratacionDocumentoVersion.findFirstOrThrow({ where: { documento: { nombre: 'Cuadro.xlsx' } } });
      const h: any = await biblio.hoja(xl.id, 0);
      expect(h.hoja.filas[0]).toEqual(['Concepto', 'Edificio Prueba Alfa']);
      expect(h.hoja.filas[1][1]).toBe('resultado');
      const pd = await prisma.contratacionDocumentoVersion.findFirstOrThrow({ where: { documento: { nombre: 'a.pdf' } } });
      await expect(biblio.hoja(pd.id, 0)).rejects.toThrow(/Sin vista previa/);
      await expect(biblio.hoja(99999, 0)).rejects.toThrow();
    });

    it('un documento retirado deja de poder previsualizarse', async () => {
      subir('Cuadro.xlsx', await xlsxFicticio());
      await indice.reindexar();
      const xl = await prisma.contratacionDocumentoVersion.findFirstOrThrow();
      fs.rmSync(path.join(dir, 'Cuadro.xlsx'));
      await indice.reindexar();
      await expect(biblio.hoja(xl.id, 0)).rejects.toThrow();
      expect((await biblio.listar({})).items[0].disponible).toBe(false);
    });
  });

  describe('comparación de cotizaciones, edificios, resoluciones y actualización de fuentes', () => {
    const subir = (rel: string, bytes: Buffer) => {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    };
    const xlsx = async (celdas: Record<string, string | number>, hoja = 'Datos') => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(hoja);
      for (const [ref, v] of Object.entries(celdas)) ws.getCell(ref).value = v;
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const PA = '9999.001.32.1.010-2030';
    const PB = '9999.001.32.1.011-2030';
    const base = (proceso: string, extra: any = {}) => ({ proceso, intervencion: 'Intervención de prueba', ...extra });

    it('un contrato con varios edificios muestra sus documentos por edificio y mantiene un solo valor contratado', async () => {
      const acta = pdf('Contrato ficticio uno');
      const visita = pdf('Visita tecnica ficticia Edificio Alfa');
      subir('Contrato.pdf', acta);
      subir('Edificio Alfa/SOPORTES TECNICOS/visita ATC.pdf', visita);
      await indice.reindexar();
      const payload = {
        version: 1,
        expedientes: [base(PA, {
          hechos: [
            { clave: 'e1', tipo: 'EDIFICACION', titulo: 'Edificio Alfa – Barrio Uno', fuente: { documento: md5(acta), pagina: 1 } },
            { clave: 'e2', tipo: 'EDIFICACION', titulo: 'Edificio Beta', fuente: { documento: md5(acta), pagina: 1 } },
            { clave: 'e3', tipo: 'EDIFICACION', titulo: 'Edificio Gamma', fuente: { documento: md5(acta), pagina: 2 } },
          ],
          ofertas: [{ clave: 'of1', proveedor: 'Empresa Uno', grupo_oferta: 'g', fuente: { documento: md5(acta), pagina: 1 } }],
          contratos: [{ clave: 'c1', tipo_acto: 'CONTRATO', numero: 'C-1', valor: 900, oferta: 'of1', justificacion: 'Menor valor documentado', fuente: { documento: md5(acta), pagina: 1 } }],
        })],
        documentos: [{ documento: md5(visita), confirmaciones: [{ tipo: 'CATEGORIA', valor: 'VISITA_SOPORTE_TECNICO' }, { tipo: 'EDIFICACION', valor: 'Edificio Alfa' }] }],
      };
      const prev: any = await importacion.previsualizar(payload);
      expect(prev.valida).toBe(true);
      await importacion.aplicar(payload, 1);
      expect(await prisma.contratacionEdificio.count()).toBe(3);
      expect(await importacion.aplicar(payload, 1)).toMatchObject({ aplicada: false }); // idempotente

      const exp = await prisma.contratacionExpediente.findFirstOrThrow({ where: { proceso: PA } });
      const det: any = await consulta.detalle(exp.id);
      expect(det.edificios.map((e: any) => e.nombre).sort()).toEqual(['Edificio Alfa', 'Edificio Beta', 'Edificio Gamma']);
      const contratado = det.comparacion.valores.find((v: any) => v.tipo === 'VALOR_CONTRATADO');
      expect(contratado.importes).toHaveLength(1);
      expect(contratado.importes[0].importe).toBe(900);
      expect(det.comparacion.seleccion).toMatchObject({ estado: 'ADJUDICADA', oferta: 'Empresa Uno' });
      const alfa = det.documentos_por_edificio.find((x: any) => x.edificio?.nombre === 'Edificio Alfa');
      expect(alfa.documentos).toHaveLength(1);

      const idAlfa = det.edificios.find((e: any) => e.nombre === 'Edificio Alfa').id;
      const ficha: any = await edificios.detalle(idAlfa);
      expect(ficha.visitas_y_soportes_tecnicos).toHaveLength(1);
      expect(ficha.visitas_y_soportes_tecnicos[0].asociaciones_faltantes).toContain('Proceso contractual');
      const beta = det.edificios.find((e: any) => e.nombre === 'Edificio Beta').id;
      expect((await edificios.detalle(beta)).procesos[0]).toMatchObject({ valor_contratado: 900, edificios_del_proceso: 3 });

      // El documento confirmado con edificio y categoría, sin proceso, es accesible desde "Todos" y desde "Clasificados".
      const todos = await biblio.listar({});
      const v = todos.items.find((x: any) => x.nombre === 'visita ATC.pdf')!;
      expect(v.clasificado).toBe(true);
      expect(v.asociaciones_faltantes).toContain('Proceso contractual pendiente');
      expect((await biblio.listar({ vista: 'clasificados' })).items.some((x: any) => x.nombre === 'visita ATC.pdf')).toBe(true);
    });

    it('una intervención solo de RCD no exige resolución; una demolición sin resolución queda pendiente aunque haya cotización', async () => {
      const doc = pdf('Cotizacion ficticia');
      subir('cot.pdf', doc);
      await indice.reindexar();
      const f = { documento: md5(doc), pagina: 1 };
      const payload = {
        version: 1,
        expedientes: [
          base(PA, { alcance_confirmado: 'RCD_SIN_DEMOLICION', hechos: [{ clave: 'e', tipo: 'EDIFICACION', titulo: 'Predio Solo Retiro', fuente: f }, { clave: 'a', tipo: 'ACTIVIDAD', titulo: 'Retiro y transporte de RCD', fuente: f }] }),
          base(PB, { hechos: [{ clave: 'e', tipo: 'EDIFICACION', titulo: 'Predio A Demoler', fuente: f }, { clave: 'a', tipo: 'ACTIVIDAD', titulo: 'Demolición mecánica', fuente: f }], valores: [{ clave: 'v', tipo: 'COTIZADO', concepto: 'Cotización', importe: 100, fuente: f }] }),
        ],
      };
      await importacion.aplicar(payload, 1);
      const [solo, demoler] = await Promise.all([
        prisma.contratacionEdificio.findFirstOrThrow({ where: { nombre: 'Predio Solo Retiro' } }),
        prisma.contratacionEdificio.findFirstOrThrow({ where: { nombre: 'Predio A Demoler' } }),
      ]);
      expect((await edificios.detalle(solo.id)).resolucion.requisito).toBe('NO_APLICA');
      expect((await edificios.detalle(demoler.id)).resolucion.requisito).toBe('PENDIENTE_SOPORTE');
      // Registrar la resolución con su soporte la deja verificada; una citada sin acta sigue pendiente.
      const res = { version: 1, resoluciones: [{ numero: '4163.010.32.1.123-2030', fecha: '2030-01-10', edificios: ['Predio A Demoler'], fuente: f }] };
      await importacion.aplicar(res, 1);
      const ficha: any = await edificios.detalle(demoler.id);
      expect(ficha.resolucion.requisito).toBe('VERIFICADA');
      expect(ficha.resolucion.resoluciones[0]).toMatchObject({ numero: '4163.010.32.1.123-2030', fecha: '2030-01-10' });
      expect(ficha.resolucion.resoluciones[0].soporte.version_id).toBeGreaterThan(0);
    });

    it('un comparativo general se consulta desde los casos respaldados con hoja y celda, sin duplicar importes', async () => {
      const cuadro = await xlsx({ A1: 'Proveedor', B2: 5000, B3: 7000 }, 'Comparativo');
      subir('Cuadro comparativo general.xlsx', cuadro);
      await indice.reindexar();
      const f = (celda: string) => ({ documento: md5(cuadro), hoja: 'Comparativo', celda });
      const payload = {
        version: 1,
        expedientes: [base(PA, { hechos: [{ clave: 'cmp1', tipo: 'FILA_COMPARATIVO', titulo: 'Fila comparativa del caso', atributos: { valor_referencia: 5000 }, fuente: f('B2') }] })],
        documentos: [{ documento: md5(cuadro), confirmaciones: [{ tipo: 'CATEGORIA', valor: 'COMPARATIVO_GENERAL' }, { tipo: 'ALCANCE', valor: 'GENERAL' }] }],
      };
      await importacion.aplicar(payload, 1);
      const exp = await prisma.contratacionExpediente.findFirstOrThrow();
      const det: any = await consulta.detalle(exp.id);
      expect(det.comparacion.comparativo_general).toHaveLength(1);
      expect(det.comparacion.comparativo_general[0].soporte).toMatchObject({ hoja: 'Comparativo', celda: 'B2' });
      // El importe de referencia no se convierte en valor del expediente.
      expect(det.valores).toHaveLength(0);
      expect(det.comparacion.valores.every((v: any) => v.estado === 'PENDIENTE_SOPORTE')).toBe(true);
      // Un único original, listado en "generales".
      const gen = await biblio.listar({ vista: 'generales' });
      expect(gen.items).toHaveLength(1);
      expect(await prisma.contratacionDocumento.count()).toBe(1);
    });

    it('sin contrato ni acta, selección, contratado y ejecutado quedan pendientes de soporte; el estudio de mercado, pendiente de recibir', async () => {
      const as = analisis('c');
      subir('as.pdf', as);
      await indice.reindexar();
      const f = { documento: md5(as), pagina: 1 };
      await importacion.aplicar({ version: 1, expedientes: [base(PROC, { ofertas: [{ clave: 'o', proveedor: 'Empresa Uno', grupo_oferta: 'g', fuente: f }], valores: [{ clave: 'p', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'Oficial', importe: 1000, fuente: f }, { clave: 'q', tipo: 'COTIZADO', concepto: 'Cotización', importe: 1000, oferta: 'o', fuente: f }] })] }, 1);
      const det: any = await consulta.detalle((await prisma.contratacionExpediente.findFirstOrThrow()).id);
      const por = (t: string) => det.comparacion.valores.find((v: any) => v.tipo === t);
      expect(por('PRESUPUESTO_OFICIAL').estado).toBe('SOPORTADO');
      expect(por('COTIZACION').importes[0].importe).toBe(1000); // mismo monto, otra fuente y otro significado
      expect(por('OFERTA_SELECCIONADA').estado).toBe('PENDIENTE_SOPORTE');
      expect(por('VALOR_CONTRATADO').estado).toBe('PENDIENTE_SOPORTE');
      expect(por('VALOR_EJECUTADO').estado).toBe('PENDIENTE_SOPORTE');
      expect(det.comparacion.seleccion.estado).toBe('PENDIENTE_SOPORTE');
      expect(det.comparacion.estudio_mercado).toMatchObject({ estado: 'PENDIENTE_DE_RECIBIR', etiqueta: 'Estudio de mercado pendiente de recibir' });
      expect(det.comparacion.estudio_mercado.analisis_del_sector).toHaveLength(1);
    });

    it('análisis de precios con datos FICTICIOS: diferencias en COP y %, sector distinto de edificio, totales sin duplicar al reimportar', async () => {
      const as = analisis('p');
      subir('as.pdf', as);
      await indice.reindexar();
      const f = { documento: md5(as), pagina: 1 };
      const exp = base(PROC, {
        intervencion: 'Demolición ficticia',
        hechos: [{ clave: 'h1', tipo: 'EDIFICACION', titulo: 'Edificio Ficticio', fuente: f }, { clave: 'h2', tipo: 'SECTOR', titulo: 'Sector Ficticio', fuente: f }],
        ofertas: [
          { clave: 'o1', proveedor: 'Empresa Uno', grupo_oferta: 'g1', fuente: f },
          { clave: 'o2', proveedor: 'Empresa Dos', grupo_oferta: 'g2', fuente: f },
          { clave: 'o3', proveedor: 'Empresa Tres', grupo_oferta: 'g3', fuente: f },
        ],
        valores: [
          { clave: 'v1', tipo: 'COTIZADO', concepto: 'Cotización', importe: 1000, oferta: 'o1', fuente: f },
          { clave: 'v2', tipo: 'COTIZADO', concepto: 'Cotización', importe: 1100, oferta: 'o2', fuente: f },
          { clave: 'v3', tipo: 'COTIZADO', concepto: 'Cotización', importe: 900, oferta: 'o3', fuente: f },
        ],
        contratos: [{ clave: 'c1', tipo_acto: 'CONTRATO', numero: 'C-F', valor: 1000, oferta: 'o1', fuente: f }],
      });
      const pend = base('9999.001.32.1.002-2030', { intervencion: 'Otra demolición ficticia', hechos: [{ clave: 'r', tipo: 'REPORTADO_CONTRATADO', titulo: 'Reportado como contratado por el equipo', fuente: f }] });
      await importacion.aplicar({ version: 1, expedientes: [exp, pend] }, 1);
      const a: any = await consulta.analisisPrecios();
      const fila = a.expedientes.find((x: any) => x.proceso === PROC);
      expect(fila).toMatchObject({ resultado: 'DENTRO_DEL_RANGO', sectores: ['Sector Ficticio'], edificios: ['Edificio Ficticio'], empresa_seleccionada: 'Empresa Uno' });
      expect(fila.valor_contratado.valor_actualizado).toBe(1000);
      expect(a.totales.contratado_demoliciones).toBe(1000);
      const det: any = await consulta.detalle(fila.id);
      expect(det.analisis_precios.referencias.find((x: any) => x.proveedor === 'Empresa Dos')).toMatchObject({ diferencia_cop: -100, diferencia_pct: -9.09 });
      // El caso reportado como contratado, sin contrato, queda en pendientes y no suma al total.
      expect(a.pendientes_de_soporte.map((x: any) => [x.proceso, x.reportado_contratado])).toEqual([['9999.001.32.1.002-2030', true]]);
      // Reimportar no altera los totales.
      await importacion.aplicar({ version: 1, expedientes: [exp, pend] }, 1);
      const b: any = await consulta.analisisPrecios();
      expect(b.totales).toEqual(a.totales);
      expect(await prisma.contratacionContrato.count()).toBe(1);
    });

    it('una nueva versión del mismo Excel no duplica el archivo; la celda sin cambios se revincula y la modificada se señala', async () => {
      const f = (md: string) => ({ documento: md, hoja: 'Datos', celda: 'B2' });
      const v1 = await xlsx({ A1: 'Concepto', B2: 100 });
      subir('Cuadro.xlsx', v1);
      await indice.reindexar();
      await importacion.aplicar({ version: 1, expedientes: [base(PA, { valores: [{ clave: 'p', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'Oficial', importe: 100, fuente: f(md5(v1)) }] })] }, 1);
      expect(await prisma.contratacionCeldaRespaldo.count()).toBe(1);

      // Cambia otra celda: la cifra respaldada sigue igual => nueva versión, mismo documento, cifra revinculada.
      const v2 = await xlsx({ A1: 'Concepto editado', B2: 100 });
      subir('Cuadro.xlsx', v2);
      await indice.reindexar();
      expect(await prisma.contratacionDocumento.count()).toBe(1);
      expect(await prisma.contratacionDocumentoVersion.count()).toBe(2);
      expect(await prisma.contratacionDocumentoOrigen.count({ where: { estado: 'ACTIVO' } })).toBe(1);
      const vers = await prisma.contratacionDocumentoVersion.findMany({ orderBy: { numero: 'asc' } });
      expect((await prisma.contratacionValor.findFirstOrThrow()).version_id).toBe(vers[1].id);
      expect(await prisma.contratacionAlertaCifra.count()).toBe(0);

      // Cambia la celda que respalda la cifra => se conserva la versión anterior y se señala para revisión.
      const v3 = await xlsx({ A1: 'Concepto editado', B2: 120 });
      subir('Cuadro.xlsx', v3);
      await indice.reindexar();
      expect(await prisma.contratacionDocumento.count()).toBe(1);
      expect((await prisma.contratacionValor.findFirstOrThrow()).version_id).toBe(vers[1].id);
      const alertas = await prisma.contratacionAlertaCifra.findMany();
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({ entidad: 'valor', hoja: 'Datos', celda: 'B2', valor_anterior: '100', valor_nuevo: '120', estado: 'PENDIENTE' });
      const det: any = await consulta.detalle((await prisma.contratacionExpediente.findFirstOrThrow()).id);
      expect(det.comparacion.alertas_cifra).toHaveLength(1);
      expect(det.valores[0].soporte.es_vigente).toBe(false); // la cifra sigue citando la versión anterior

      // Reindexar de nuevo no repite alertas ni versiones.
      await indice.reindexar();
      expect(await prisma.contratacionAlertaCifra.count()).toBe(1);
      expect(await prisma.contratacionDocumentoVersion.count()).toBe(3);

      // Reconfirmar la cifra con la versión nueva resuelve la alerta.
      await importacion.aplicar({ version: 1, expedientes: [base(PA, { valores: [{ clave: 'p', tipo: 'PRESUPUESTO_OFICIAL', concepto: 'Oficial', importe: 120, fuente: f(md5(v3)) }] })] }, 1);
      expect((await prisma.contratacionAlertaCifra.findFirstOrThrow()).estado).toBe('RESUELTA');
    });

    it('sincronización periódica: distingue falla de conexión de carpeta vacía y no retira documentos por una carpeta vacía inesperada', async () => {
      process.env.SEGUIMIENTO_USUARIO_ID = '1';
      const sync = new ContratacionSincronizacionService(prisma as any, indice);
      drive.poner('F1', 'doc.pdf', analisis('uno'));
      expect(await sync.ejecutar()).toBe('OK');
      expect((await sync.estado()).ultima_correcta).not.toBeNull();
      const correcta = (await sync.estado()).ultima_correcta;

      drive.caido = true; // falla de conexión
      expect(await sync.ejecutar()).toBe('ERROR');
      let est = await sync.estado();
      expect(est.estado).toBe('ERROR');
      expect(est.ultima_correcta).toEqual(correcta); // la última correcta se conserva
      expect((await consulta.fuentes()).find((x) => x.tipo === 'DRIVE')!.estado).toBe('ERROR');
      expect(await prisma.contratacionDocumentoOrigen.count({ where: { estado: 'ACTIVO' } })).toBe(1);

      drive.caido = false;
      drive.archivos.clear(); // carpeta vacía
      expect(await sync.ejecutar()).toBe('OK');
      expect((await consulta.fuentes()).find((x) => x.tipo === 'DRIVE')!.estado).toBe('VACIA');
      expect(await prisma.contratacionDocumentoOrigen.count({ where: { estado: 'ACTIVO' } })).toBe(1); // no se retiró nada
      await indice.reindexar({ confirmarVacia: true }); // la actualización manual sí lo confirma
      expect(await prisma.contratacionDocumentoOrigen.count({ where: { estado: 'ACTIVO' } })).toBe(0);
      delete process.env.SEGUIMIENTO_USUARIO_ID;
    });

    it('reindexar conserva documentos, asociaciones confirmadas y versiones', async () => {
      const visita = pdf('Visita ficticia ATC');
      subir('Edificio Alfa/SOPORTES TECNICOS/visita.pdf', visita);
      await indice.reindexar();
      await importacion.aplicar({ version: 1, documentos: [{ documento: md5(visita), confirmaciones: [{ tipo: 'EDIFICACION', valor: 'Edificio Alfa' }, { tipo: 'CATEGORIA', valor: 'VISITA_SOPORTE_TECNICO' }] }] }, 1);
      const antes = { ...(await cuenta()), enlaces: await prisma.contratacionDocumentoEdificio.count() };
      await indice.reindexar();
      await indice.reindexar();
      expect({ ...(await cuenta()), enlaces: await prisma.contratacionDocumentoEdificio.count() }).toEqual(antes);
      const doc = await prisma.contratacionDocumento.findFirstOrThrow();
      expect(doc.categoria).toBe('VISITA_SOPORTE_TECNICO');
    });
  });


  describe('botón «Actualizar índice» (trabajo en segundo plano)', () => {
    const esperar = async () => {
      for (let i = 0; i < 200; i++) {
        const t = indice.estadoTrabajo();
        if (t && t.estado !== 'EN_CURSO') return t;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('la actualización no terminó');
    };

    it('un archivo nuevo en la fuente aparece al pulsar el botón, sin recargar y sin esperar la sincronización', async () => {
      fs.writeFileSync(path.join(dir, 'previo.pdf'), analisis());
      await indice.reindexar();
      const antes = await biblio.listar({ vista: 'todos' } as any);
      fs.writeFileSync(path.join(dir, 'nuevo.pdf'), pdf('Documento ficticio subido despues'));
      const r = indice.iniciar('MANUAL');
      expect(r.ya_en_curso).toBe(false);
      expect(r.trabajo.estado).toBe('EN_CURSO'); // responde de inmediato, antes de terminar
      const fin = await esperar();
      expect(fin.estado).toBe('FINALIZADA');
      expect(fin.finalizado_en).not.toBeNull();
      expect(fin.cambios.filter((c) => c.tipo === 'NUEVO').map((c) => c.nombre)).toEqual(['nuevo.pdf']);
      expect(fin.resultado!.local.nuevos).toBe(1);
      const despues = await biblio.listar({ vista: 'todos' } as any);
      expect(despues.conteos.todos).toBe(antes.conteos.todos + 1);
    });

    it('si ya hay una actualización en curso, el botón sigue esa misma y no inicia otra', async () => {
      fs.writeFileSync(path.join(dir, 'a.pdf'), analisis());
      const a = indice.iniciar('MANUAL');
      const b = indice.iniciar('MANUAL');
      expect(b.ya_en_curso).toBe(true);
      expect(b.trabajo.id).toBe(a.trabajo.id);
      await esperar();
    });

    it('un archivo modificado se informa como modificado y una fuente sin cambios lo indica', async () => {
      fs.writeFileSync(path.join(dir, 'x.pdf'), analisis('v1'));
      await indice.reindexar();
      fs.writeFileSync(path.join(dir, 'x.pdf'), analisis('v2 cambiada'));
      indice.iniciar('MANUAL');
      const fin = await esperar();
      expect(fin.cambios).toEqual([{ fuente: 'LOCAL', nombre: 'x.pdf', tipo: 'MODIFICADO' }]);
      indice.iniciar('MANUAL');
      const sin = await esperar();
      expect(sin.cambios).toEqual([]);
    });

    it('un fallo de Drive se informa por fuente y no se confunde con carpeta vacía', async () => {
      drive.caido = true;
      indice.iniciar('MANUAL');
      const fin = await esperar();
      expect(fin.resultado!.drive.estado).toBe('ERROR');
      expect(fin.resultado!.drive.detalle).toMatch(/conexión/);
    });
  });
});
