import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { esTranscripcion } from './contratacion-clasificador';

export interface ArchivoLocal {
  idOrigen: string; // ruta relativa posix
  nombre: string;
  tamano: number;
  modificadoEn: Date;
  md5: string;
  mime: string;
}

export interface ResultadoEscaneoLocal {
  archivos: ArchivoLocal[];
  omitidos: { simbolicos: number; transcripciones: number; ocultos: number };
}

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function md5Archivo(ruta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('md5');
    fs.createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** Devuelve la ruta real solo si el archivo está dentro de la carpeta permitida (resuelve enlaces simbólicos). */
export async function resolverDentro(base: string, relativa: string): Promise<string | null> {
  try {
    if (!relativa || relativa.includes('\0') || path.isAbsolute(relativa)) return null;
    const realBase = await fs.promises.realpath(base);
    const real = await fs.promises.realpath(path.resolve(realBase, relativa));
    const rel = path.relative(realBase, real);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const st = await fs.promises.stat(real);
    return st.isFile() ? real : null;
  } catch {
    return null;
  }
}

/** Escaneo recursivo (profundidad ≤ 4). No sigue enlaces simbólicos. Lanza si la carpeta no existe. */
export async function escanearLocal(base: string): Promise<ResultadoEscaneoLocal> {
  const realBase = await fs.promises.realpath(base);
  const out: ResultadoEscaneoLocal = { archivos: [], omitidos: { simbolicos: 0, transcripciones: 0, ocultos: 0 } };
  async function rec(dir: string, depth: number) {
    for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('~$')) { out.omitidos.ocultos++; continue; }
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) { out.omitidos.simbolicos++; continue; }
      if (e.isDirectory()) { if (depth < 4) await rec(abs, depth + 1); continue; }
      if (!e.isFile()) continue;
      if (esTranscripcion(e.name)) { out.omitidos.transcripciones++; continue; }
      const st = await fs.promises.stat(abs);
      out.archivos.push({
        idOrigen: path.relative(realBase, abs).split(path.sep).join('/'),
        nombre: e.name,
        tamano: st.size,
        modificadoEn: st.mtime,
        md5: await md5Archivo(abs),
        mime: MIME[path.extname(e.name).toLowerCase()] ?? 'application/octet-stream',
      });
    }
  }
  await rec(realBase, 0);
  return out;
}
