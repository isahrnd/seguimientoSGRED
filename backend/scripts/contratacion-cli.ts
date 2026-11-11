/**
 * CLI del Monitoreo de contratación (se ejecuta EN el servidor, sin HTTP).
 *   npm run contratacion:reindexar
 *   npm run contratacion:importar -- <archivo.json> [--aplicar]
 *   npm run contratacion:drive-vincular
 * No imprime contenido de documentos, cifras ni credenciales.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as http from 'http';
import * as crypto from 'crypto';
import { NestFactory } from '@nestjs/core';
import { MonitoreoContratacionModule } from '../src/contratacion/monitoreo-contratacion.module';
import { ContratacionIndiceService, paginasPdf } from '../src/contratacion/contratacion-indice.service';
import { ContratacionDocumentosService } from '../src/contratacion/contratacion-documentos.service';
import { tipoPorSegmento } from '../src/contratacion/contratacion-identificadores';
import { compararEdificio } from '../src/contratacion/contratacion-edificios-match';
import { edificacionDeCarpeta } from '../src/contratacion/contratacion-sugerencias';
import { ContratacionImportacionService } from '../src/contratacion/contratacion-importacion.service';
import { driveRootId, driveTokenFile, ENV_CONTRATACION } from '../src/contratacion/contratacion.config';

async function vincularDrive() {
  const id = process.env[ENV_CONTRATACION.DRIVE_CLIENT_ID];
  const secret = process.env[ENV_CONTRATACION.DRIVE_CLIENT_SECRET];
  const raiz = driveRootId();
  if (!id || !secret || !raiz) {
    console.error(`Faltan ${ENV_CONTRATACION.DRIVE_CLIENT_ID}, ${ENV_CONTRATACION.DRIVE_CLIENT_SECRET} o ${ENV_CONTRATACION.DRIVE_ROOT_ID} en el entorno del servidor.`);
    process.exit(1);
  }
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  await new Promise<void>((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) { res.end('Solicitud no válida'); return; }
      try {
        const redirect = `http://127.0.0.1:${(srv.address() as any).port}`;
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: u.searchParams.get('code')!, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
        });
        const j: any = await r.json();
        if (!j.refresh_token) throw new Error('Google no devolvió refresh_token');
        fs.writeFileSync(driveTokenFile(), JSON.stringify({ refresh_token: j.refresh_token }), { mode: 0o600 });
        res.end('Drive vinculado en modo solo lectura. Puede cerrar esta ventana.');
        console.log('Vinculación completada (solo lectura). Token guardado en el archivo privado del servidor.');
        srv.close(); resolve();
      } catch (e) { res.end('Error al vincular'); srv.close(); reject(e); }
    });
    srv.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${(srv.address() as any).port}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.readonly',
        access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state,
      });
      console.log('Abra esta dirección en el navegador con la cuenta que tiene acceso de lectura a la carpeta:\n' + url);
    });
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'drive-vincular') return vincularDrive();
  const app = await NestFactory.createApplicationContext(MonitoreoContratacionModule, { logger: ['error'] });
  try {
    if (cmd === 'reindexar') {
      console.log(JSON.stringify(await app.get(ContratacionIndiceService).reindexar(), null, 2));
    } else if (cmd === 'verificar-envio') {
      // Simulación: arma la solicitud de cada versión y aplica la barrera de privacidad al texto EXACTO que saldría. No llama a la API ni escribe nada.
      const lista = (args.find((a) => a.startsWith('--versiones=')) ?? '').slice(12).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!lista.length) throw new Error('Indique --versiones=ID,ID,...');
      const indice = app.get(ContratacionIndiceService);
      await indice.reindexar({ ia: { versiones: lista, forzar: args.includes('--forzar'), simular: true } });
      for (const s of indice.ultimoResumenIa?.simulacion ?? []) console.log(JSON.stringify(s));
      console.log(JSON.stringify({ simulacion: true, versiones: lista.length, bloquearian: (indice.ultimoResumenIa?.simulacion ?? []).filter((s: any) => s.hallazgos.length).length }));
    } else if (cmd === 'interpretar') {
      // Ejecución MANUAL de la lectura asistida sobre versiones concretas: --versiones=12,15,20 [--detalle]
      const lista = (args.find((a) => a.startsWith('--versiones=')) ?? '').slice(12).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!lista.length) throw new Error('Indique --versiones=ID,ID,...');
      if (lista.length > 10) throw new Error('Por seguridad, un máximo de 10 versiones por ejecución manual');
      const indice = app.get(ContratacionIndiceService);
      await indice.reindexar({ ia: { versiones: lista, forzar: args.includes('--forzar') } });
      console.log(JSON.stringify({ resumen: { llamadas: indice.ultimoResumenIa?.llamadas, bloqueadas: indice.ultimoResumenIa?.bloqueadas, reutilizadas: indice.ultimoResumenIa?.reutilizadas, nativas: indice.ultimoResumenIa?.nativas } }));
      const filas = await (indice as any).prisma.contratacionIaExtraccion.findMany({ where: { version_id: { in: lista } }, orderBy: { version_id: 'asc' }, include: { version: { include: { documento: true } } } });
      for (const f of filas) {
        console.log(JSON.stringify({ version: f.version_id, documento: f.version.documento.nombre, estado: f.estado, error: f.error, tokens_entrada: f.tokens_entrada, tokens_salida: f.tokens_salida, descartes: f.descartes, ...(args.includes('--detalle') ? { resultado: f.resultado } : { campos: Object.keys((f.resultado as any)?.campos ?? {}) }) }));
      }
      console.log(JSON.stringify(await indice.ia.estado()));
    } else if (cmd === 'desglose-nativo') {
      // Completa, SIN llamar a la API, el desglose de lecturas ya aceptadas leyendo la tabla de presupuesto del texto nativo (solo si sus controles aritméticos cuadran).
      const lista = (args.find((a) => a.startsWith('--versiones=')) ?? '').slice(12).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!lista.length) throw new Error('Indique --versiones=ID,ID,...');
      const docs = app.get(ContratacionDocumentosService);
      const ia = app.get(ContratacionIndiceService).ia;
      const prisma = (app.get(ContratacionIndiceService) as any).prisma;
      const lectura = {
        paginas: async (md5: string, max: number) => {
          const v = await prisma.contratacionDocumentoVersion.findFirst({ where: { md5 }, select: { id: true } });
          if (!v) return null;
          const { buf } = await docs.leerBytes(v.id, 15 * 1024 * 1024);
          return paginasPdf(buf, max);
        },
        bytes: async () => null,
      };
      for (const r of await ia.completarDesgloseNativo(lectura as any, lista)) console.log(JSON.stringify(r));
    } else if (cmd === 'lectura-visual') {
      // Filas leídas de la imagen original (archivo JSON privado): --version=ID --archivo=ruta. Solo se acepta si la suma coincide con el total impreso.
      const id = Number((args.find((a) => a.startsWith('--version=')) ?? '').slice(10));
      const ruta = (args.find((a) => a.startsWith('--archivo=')) ?? '').slice(10);
      if (!Number.isInteger(id) || id <= 0 || !ruta) throw new Error('Indique --version=ID y --archivo=ruta');
      console.log(JSON.stringify(await app.get(ContratacionIndiceService).ia.incorporarLecturaVisual(id, JSON.parse(fs.readFileSync(ruta, 'utf8')))));
    } else if (cmd === 'cierre-ocr') {
      // OCR local selectivo de una página (--pagina=N) para leer el cierre de una oferta cuya tabla es una imagen. Sin API; solo se acepta si cuadra la aritmética.
      const lista = (args.find((a) => a.startsWith('--versiones=')) ?? '').slice(12).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      const pagina = Number((args.find((a) => a.startsWith('--pagina=')) ?? '').slice(9));
      if (!lista.length || !Number.isInteger(pagina) || pagina < 1) throw new Error('Indique --versiones=ID,ID y --pagina=N');
      const docs = app.get(ContratacionDocumentosService);
      const ia = app.get(ContratacionIndiceService).ia;
      for (const id of lista) {
        const { buf } = await docs.leerBytes(id, 15 * 1024 * 1024);
        console.log(JSON.stringify(await ia.completarCierreOcr(id, pagina, buf)));
      }
    } else if (cmd === 'proponer-vinculos-carpeta') {
      // Un mismo archivo en varias carpetas de Drive (una por edificio): propone como SUGERIDA la edificación de cada carpeta aún sin vínculo.
      // Solo crea sugerencias (evidencia: la ruta de la carpeta). No confirma vínculos ni toca importes, contratos o expedientes.
      const id = Number((args.find((a) => a.startsWith('--documento=')) ?? '').slice(12));
      if (!Number.isInteger(id) || id <= 0) throw new Error('Indique --documento=ID');
      const prisma = (app.get(ContratacionIndiceService) as any).prisma;
      const doc = await prisma.contratacionDocumento.findUnique({ where: { id }, include: { edificios: true, versiones: { where: { vigente: true }, include: { origenes: { where: { estado: 'ACTIVO' } } } } } });
      if (!doc) throw new Error('Documento inexistente');
      const registrados = (await prisma.contratacionEdificio.findMany({ select: { id: true, nombre: true } })).map((e: any) => ({ ...e, vinculado: doc.edificios.some((x: any) => x.edificio_id === e.id) }));
      const md5 = doc.versiones[0]?.md5 ?? null;
      for (const o of doc.versiones.flatMap((v: any) => v.origenes)) {
        const carpeta = edificacionDeCarpeta(o.ruta);
        const cmp = carpeta ? compararEdificio(carpeta, registrados) : null;
        const propuesta = cmp && cmp.estado === 'COINCIDE' && cmp.vinculado_al_documento === false ? cmp : null;
        console.log(JSON.stringify({ origen: o.ruta, carpeta, edificio: cmp?.edificio ?? null, coincidencia: cmp?.estado ?? null, ya_vinculado: cmp?.vinculado_al_documento ?? null, propuesta: !!propuesta }));
        if (propuesta && args.includes('--aplicar')) {
          await prisma.contratacionDocSugerencia.upsert({
            where: { documento_id_tipo_valor_fuente_tipo_fuente_detalle: { documento_id: id, tipo: 'EDIFICACION', valor: carpeta, fuente_tipo: 'CARPETA', fuente_detalle: carpeta } },
            create: { documento_id: id, tipo: 'EDIFICACION', valor: carpeta, fuente_tipo: 'CARPETA', fuente_detalle: carpeta },
            update: {},
          });
          console.log(JSON.stringify({ sugerencia_registrada: { documento: id, valor: carpeta, estado: 'SUGERIDA' }, para_confirmar: { version: 1, documentos: [{ documento: md5, confirmaciones: [{ tipo: 'EDIFICACION', valor: propuesta.edificio }] }] } }));
        }
      }
    } else if (cmd === 'corregir-identificadores') {
      // Documentos cuyo «proceso detectado» no es un número de proceso (p. ej. guarda un número de contrato). Por defecto solo informa;
      // con --aplicar vacía ÚNICAMENTE ese campo derivado. No toca expediente, estado de clasificación ni asociaciones.
      const prisma = (app.get(ContratacionIndiceService) as any).prisma;
      const docs = await prisma.contratacionDocumento.findMany({ where: { proceso_detectado: { not: null } }, include: { expediente: { select: { proceso: true } } }, orderBy: { id: 'asc' } });
      const afectados = docs.filter((d: any) => tipoPorSegmento(d.proceso_detectado) !== 'PROCESO');
      for (const d of afectados) console.log(JSON.stringify({ documento: d.id, nombre: d.nombre, proceso_detectado: d.proceso_detectado, tipo_real: tipoPorSegmento(d.proceso_detectado), expediente_asociado: d.expediente?.proceso ?? null }));
      if (args.includes('--aplicar') && afectados.length) {
        const r = await prisma.contratacionDocumento.updateMany({ where: { id: { in: afectados.map((d: any) => d.id) } }, data: { proceso_detectado: null } });
        console.log(JSON.stringify({ corregidos: r.count, nota: 'solo proceso_detectado; asociaciones intactas' }));
      } else console.log(JSON.stringify({ afectados: afectados.length, aplicado: false }));
    } else if (cmd === 'importar') {
      const archivo = args.find((a) => !a.startsWith('--'));
      if (!archivo) throw new Error('Indique el archivo JSON de importación');
      const payload = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      const svc = app.get(ContratacionImportacionService);
      if (args.includes('--aplicar')) console.log(JSON.stringify(await svc.aplicar(payload, null), null, 2));
      else { const v = await svc.previsualizar(payload); console.log(JSON.stringify({ valida: v.valida, errores: v.errores, advertencias: v.advertencias, resumen: v.resumen }, null, 2)); }
    } else {
      console.error('Comandos: reindexar | desglose-nativo --versiones=ID,ID | verificar-envio --versiones=ID,ID [--forzar] | proponer-vinculos-carpeta --documento=ID [--aplicar] | corregir-identificadores [--aplicar] | interpretar --versiones=ID,ID [--detalle] [--forzar] | importar <archivo> [--aplicar] | drive-vincular');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 500)); process.exit(1); });
