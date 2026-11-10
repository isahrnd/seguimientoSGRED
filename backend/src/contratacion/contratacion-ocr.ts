import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * OCR local (Poppler + Tesseract). Nada sale del servidor. Solo se usa para páginas de PDF sin texto nativo
 * (documentos escaneados). El resultado se guarda por versión y página.
 */
export const MOTOR_OCR = 'tesseract-spa';
/** Una página con menos caracteres que esto se considera sin texto nativo. */
export const MIN_TEXTO_NATIVO = 25;

export interface EjecutorOcr {
  disponible(): boolean;
  /** Texto de las páginas pedidas (1-based) del PDF; una página que falla devuelve ''. */
  paginas(pdf: Buffer, paginas: number[]): string[];
}

const existe = (bin: string) => {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  return !r.error && (r.status === 0 || r.status === 1);
};

export class OcrLocal implements EjecutorOcr {
  private ok: boolean | null = null;
  disponible(): boolean {
    if (process.env.SEGUIMIENTO_OCR === 'false') return false;
    if (this.ok === null) this.ok = existe('tesseract') && existe('pdftoppm');
    return this.ok;
  }
  paginas(pdf: Buffer, paginas: number[]): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
    try {
      const archivo = path.join(dir, 'doc.pdf');
      fs.writeFileSync(archivo, pdf, { mode: 0o600 });
      return paginas.map((p) => {
        const base = path.join(dir, `p${p}`);
        const img = spawnSync('pdftoppm', ['-r', '200', '-f', String(p), '-l', String(p), '-png', '-singlefile', archivo, base], { timeout: 120_000 });
        if (img.status !== 0 || !fs.existsSync(`${base}.png`)) return '';
        const t = spawnSync('tesseract', [`${base}.png`, 'stdout', '-l', process.env.SEGUIMIENTO_OCR_IDIOMA || 'spa', '--psm', '6'], {
          encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
        });
        return t.status === 0 ? String(t.stdout ?? '').trim() : '';
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

/**
 * Completa con OCR las páginas sin texto nativo. `cache` devuelve el texto ya guardado de (versión, página) para no
 * repetir el trabajo y `guardar` persiste el nuevo.
 */
export async function completarConOcr(opts: {
  ejecutor: EjecutorOcr;
  pdf: () => Promise<Buffer>;
  paginas: { pagina: number; texto: string }[];
  cache: (pagina: number) => Promise<string | null>;
  guardar: (pagina: number, texto: string) => Promise<void>;
}): Promise<{ paginas: { pagina: number; texto: string }[]; ocr: number; desdeCache: number }> {
  const sin = opts.paginas.filter((p) => p.texto.trim().length < MIN_TEXTO_NATIVO);
  if (sin.length === 0) return { paginas: opts.paginas, ocr: 0, desdeCache: 0 };
  const resultado = new Map<number, string>();
  const faltan: number[] = [];
  let desdeCache = 0;
  for (const p of sin) {
    const c = await opts.cache(p.pagina);
    if (c !== null) {
      resultado.set(p.pagina, c);
      desdeCache++;
    } else faltan.push(p.pagina);
  }
  let ocr = 0;
  if (faltan.length && opts.ejecutor.disponible()) {
    const textos = opts.ejecutor.paginas(await opts.pdf(), faltan);
    for (let i = 0; i < faltan.length; i++) {
      resultado.set(faltan[i], textos[i]);
      if (textos[i]) {
        await opts.guardar(faltan[i], textos[i]);
        ocr++;
      }
    }
  }
  return {
    paginas: opts.paginas.map((p) => (resultado.get(p.pagina) ? { pagina: p.pagina, texto: resultado.get(p.pagina)! } : p)),
    ocr,
    desdeCache,
  };
}
