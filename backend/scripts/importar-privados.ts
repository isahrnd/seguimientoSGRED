/**
 * Importación privada (mecanismo de operación del servidor; el HTTP responde 403 a toda sesión).
 *
 *   npm run contratacion:importar-privados            # reindexa, valida y aplica en el orden del manifiesto
 *   npm run contratacion:importar-privados -- --solo-vista-previa
 *
 * Carpeta: SEGUIMIENTO_IMPORT_DIR (por defecto <SEGUIMIENTO_DOCS_DIR>/../importaciones).
 * Manifiesto: <carpeta>/manifiesto.json => [{ "archivo": "x.json", "sha256": "…" }, …] en el orden de dependencias
 * (índice documental -> expedientes y valores -> asociaciones y ampliaciones). Para cada archivo:
 *   1. comprueba el SHA-256; 2. vista previa; 3. aplica si es válida; 4. repite la vista previa y exige cero cambios;
 *   5. segunda aplicación sin efecto y con los mismos conteos.
 * No imprime contenido de documentos, cifras ni credenciales.
 */
import 'reflect-metadata';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { MonitoreoContratacionModule } from '../src/contratacion/monitoreo-contratacion.module';
import { ContratacionImportacionService } from '../src/contratacion/contratacion-importacion.service';
import { ContratacionIndiceService } from '../src/contratacion/contratacion-indice.service';
import { docsDir } from '../src/contratacion/contratacion.config';

const sanea = (s: unknown) => String(s).replace(/postgres(ql)?:\/\/[^\s'"]+/gi, '<url-oculta>').slice(0, 400);
const resumen = (v: any) => `crear ${v.resumen?.crear ?? '-'}, actualizar ${v.resumen?.actualizar ?? '-'}, sin cambios ${v.resumen?.sin_cambios ?? '-'}`;

export async function conteos(prisma: PrismaClient) {
  return {
    expedientes: await prisma.contratacionExpediente.count(),
    documentos: await prisma.contratacionDocumento.count(),
    versiones: await prisma.contratacionDocumentoVersion.count(),
    origenes: await prisma.contratacionDocumentoOrigen.count(),
    edificios: await prisma.contratacionEdificio.count(),
    ofertas: await prisma.contratacionOferta.count(),
    lineas: await prisma.contratacionLinea.count(),
    valores: await prisma.contratacionValor.count(),
    contratos: await prisma.contratacionContrato.count(),
    hechos: await prisma.contratacionHecho.count(),
    resoluciones: await prisma.contratacionResolucion.count(),
    asociaciones_expediente_edificio: await prisma.contratacionExpedienteEdificio.count(),
    asociaciones_documento_edificio: await prisma.contratacionDocumentoEdificio.count(),
  };
}

async function main() {
  const soloVista = process.argv.includes('--solo-vista-previa');
  const dir = path.resolve(process.env.SEGUIMIENTO_IMPORT_DIR || path.join(docsDir(), '..', 'importaciones'));
  const manifiestoRuta = path.join(dir, 'manifiesto.json');
  if (!fs.existsSync(manifiestoRuta)) {
    console.error(`Falta ${manifiestoRuta}. Cree el manifiesto con los SHA-256 verificados (ver docs/OPERACION.md).`);
    process.exit(1);
  }
  const lista: { archivo: string; sha256: string }[] = JSON.parse(fs.readFileSync(manifiestoRuta, 'utf8'));
  const app = await NestFactory.createApplicationContext(MonitoreoContratacionModule, { logger: ['error'] });
  const prisma = new PrismaClient({ log: [] });
  let fallo = false;
  try {
    const indice = app.get(ContratacionIndiceService);
    const r = await indice.reindexar();
    console.log(`INFO  índice documental: local ${r.local.estado} (${r.local.total}), drive ${r.drive.estado}`);
    const svc = app.get(ContratacionImportacionService);
    for (const x of lista) {
      const ruta = path.join(dir, x.archivo);
      if (!fs.existsSync(ruta)) { console.log(`INFO  ${x.archivo}: no está en la carpeta privada; se omite`); continue; }
      const bytes = fs.readFileSync(ruta);
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      if (sha !== x.sha256) { console.log(`FALLA ${x.archivo}: el SHA-256 no coincide con el verificado; no se importa`); fallo = true; continue; }
      console.log(`OK    ${x.archivo}: SHA-256 verificado`);
      const payload = JSON.parse(bytes.toString('utf8'));
      const antes = await conteos(prisma);
      const v: any = await svc.previsualizar(payload);
      console.log(`${v.valida ? 'OK   ' : 'FALLA'} vista previa: ${resumen(v)}; errores ${v.errores?.length ?? 0}; advertencias ${v.advertencias?.length ?? 0}`);
      for (const e of (v.errores || []).slice(0, 10)) console.log(`  error: ${sanea(e)}`);
      for (const e of (v.advertencias || []).slice(0, 10)) console.log(`  aviso: ${sanea(e)}`);
      if (!v.valida) { fallo = true; continue; }
      if (soloVista) continue;
      const a: any = await svc.aplicar(payload, null);
      console.log(`OK    aplicación: ${a.aplicada ? 'aplicada' : sanea(a.mensaje || 'sin cambios')}`);
      const despues = await conteos(prisma);
      console.log(`INFO  conteos antes:   ${JSON.stringify(antes)}`);
      console.log(`INFO  conteos después: ${JSON.stringify(despues)}`);
      const v2: any = await svc.previsualizar(payload);
      const sinCambios = v2.valida && v2.resumen?.crear === 0 && v2.resumen?.actualizar === 0;
      console.log(`${sinCambios ? 'OK   ' : 'FALLA'} repetición no duplica: ${resumen(v2)}`);
      const a2: any = await svc.aplicar(payload, null);
      const igual = JSON.stringify(await conteos(prisma)) === JSON.stringify(despues);
      console.log(`${igual && !a2.aplicada ? 'OK   ' : 'FALLA'} segunda aplicación sin efecto; conteos iguales: ${igual}`);
      if (!sinCambios || !igual || a2.aplicada) fallo = true;
    }
    console.log(`INFO  conteos finales: ${JSON.stringify(await conteos(prisma))}`);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
  if (fallo) process.exit(1);
}

main().catch((e) => { console.error('FALLA importación privada: ' + sanea(e?.message ?? e)); process.exit(1); });
