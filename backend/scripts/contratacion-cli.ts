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
import { ContratacionIndiceService } from '../src/contratacion/contratacion-indice.service';
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
    } else if (cmd === 'interpretar') {
      // Ejecución MANUAL de la lectura asistida sobre versiones concretas: --versiones=12,15,20 [--detalle]
      const lista = (args.find((a) => a.startsWith('--versiones=')) ?? '').slice(12).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!lista.length) throw new Error('Indique --versiones=ID,ID,...');
      if (lista.length > 10) throw new Error('Por seguridad, un máximo de 10 versiones por ejecución manual');
      const indice = app.get(ContratacionIndiceService);
      await indice.reindexar({ ia: { versiones: lista } });
      const filas = await (indice as any).prisma.contratacionIaExtraccion.findMany({ where: { version_id: { in: lista } }, orderBy: { version_id: 'asc' }, include: { version: { include: { documento: true } } } });
      for (const f of filas) {
        console.log(JSON.stringify({ version: f.version_id, documento: f.version.documento.nombre, estado: f.estado, error: f.error, tokens_entrada: f.tokens_entrada, tokens_salida: f.tokens_salida, descartes: f.descartes, ...(args.includes('--detalle') ? { resultado: f.resultado } : { campos: Object.keys((f.resultado as any)?.campos ?? {}) }) }));
      }
      console.log(JSON.stringify(await indice.ia.estado()));
    } else if (cmd === 'importar') {
      const archivo = args.find((a) => !a.startsWith('--'));
      if (!archivo) throw new Error('Indique el archivo JSON de importación');
      const payload = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      const svc = app.get(ContratacionImportacionService);
      if (args.includes('--aplicar')) console.log(JSON.stringify(await svc.aplicar(payload, null), null, 2));
      else { const v = await svc.previsualizar(payload); console.log(JSON.stringify({ valida: v.valida, errores: v.errores, advertencias: v.advertencias, resumen: v.resumen }, null, 2)); }
    } else {
      console.error('Comandos: reindexar | interpretar --versiones=ID,ID [--detalle] | importar <archivo> [--aplicar] | drive-vincular');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 500)); process.exit(1); });
