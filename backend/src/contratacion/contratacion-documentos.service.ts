import { Inject, Injectable, NotFoundException, UnsupportedMediaTypeException, HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from 'libs/core/services/prisma.service';
import { docsDir, driveRootId } from './contratacion.config';
import { CONTRATACION_DRIVE_CLIENT, DriveClient, verificarEnRaiz } from './contratacion-drive.client';
import { resolverDentro } from './contratacion-fuente-local';

export function parsearRango(h: string | undefined, total: number): { inicio: number; fin: number } | 'INVALIDO' | null {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'INVALIDO';
  let inicio: number, fin: number;
  if (m[1] === '') { const suf = Number(m[2]); if (suf === 0) return 'INVALIDO'; inicio = Math.max(0, total - suf); fin = total - 1; }
  else { inicio = Number(m[1]); fin = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1); }
  if (inicio >= total || inicio > fin) return 'INVALIDO';
  return { inicio, fin };
}

const nombreSeguro = (s: string) => s.replace(/[^\w.\- ]+/g, '_').slice(0, 120);

/** 503 si la fuente falló por una causa pasajera (reintentable); 410 solo cuando se comprobó que el archivo ya no está o cambió. */
export function sinFuente(transitorio: boolean): HttpException {
  return transitorio
    ? new HttpException('La fuente del documento no respondió; intente de nuevo en unos segundos', HttpStatus.SERVICE_UNAVAILABLE)
    : new HttpException('El documento ya no está disponible en una fuente autorizada o cambió; actualice el índice', HttpStatus.GONE);
}

@Injectable()
export class ContratacionDocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTRATACION_DRIVE_CLIENT) private readonly drive: DriveClient,
  ) {}

  /** Entrega el contenido de UNA versión indexada. El navegador nunca aporta rutas ni ids de Drive. */
  async servir(versionId: number, rangoHeader: string | undefined, res: any): Promise<void> {
    const v = await this.prisma.contratacionDocumentoVersion.findUnique({
      where: { id: versionId },
      include: { documento: true, origenes: { where: { estado: 'ACTIVO' } } },
    });
    if (!v || v.origenes.length === 0) throw new NotFoundException('Documento no disponible en ninguna fuente autorizada');
    const origenes = [...v.origenes].sort((a, b) => (a.tipo === 'LOCAL' ? -1 : 1) - (b.tipo === 'LOCAL' ? -1 : 1));
    if (!origenes.some((o) => o.mime === 'application/pdf')) {
      throw new UnsupportedMediaTypeException('Sin vista previa para este formato');
    }
    let transitorio = false;
    for (const o of origenes) {
      if (o.mime !== 'application/pdf') continue;
      try {
        if (o.tipo === 'LOCAL' && (await this.local(o, v, rangoHeader, res))) return;
        if (o.tipo === 'DRIVE' && (await this.enDrive(o, v, rangoHeader, res))) return;
      } catch (e) {
        if (e instanceof HttpException) throw e;
        // origen caído: se intenta la alternativa autorizada; si todas fallan por causas pasajeras no se dice «retirado»
        transitorio = true;
      }
    }
    throw sinFuente(transitorio);
  }

  /** Lee el contenido completo de una versión (con los mismos controles que `servir`), con tope de tamaño. */
  async leerBytes(versionId: number, maxBytes: number): Promise<{ buf: Buffer; mime: string; origen: string }> {
    const v = await this.prisma.contratacionDocumentoVersion.findUnique({
      where: { id: versionId },
      include: { documento: true, origenes: { where: { estado: 'ACTIVO' } } },
    });
    if (!v || v.origenes.length === 0) throw new NotFoundException('Documento no disponible en ninguna fuente autorizada');
    const origenes = [...v.origenes].sort((a, b) => (a.tipo === 'LOCAL' ? -1 : 1) - (b.tipo === 'LOCAL' ? -1 : 1));
    let transitorio = false;
    for (const o of origenes) {
      try {
        if (o.tipo === 'LOCAL') {
          const real = await resolverDentro(docsDir(), o.id_origen);
          if (!real) continue;
          const st = await fs.promises.stat(real);
          if (o.tamano != null && BigInt(st.size) !== o.tamano) continue;
          if (st.size > maxBytes) throw new HttpException('Archivo demasiado grande para la vista previa', HttpStatus.PAYLOAD_TOO_LARGE);
          return { buf: await fs.promises.readFile(real), mime: o.mime ?? '', origen: 'LOCAL' };
        }
        const raiz = driveRootId();
        if (!raiz || !this.drive.configurado()) continue;
        const f = await verificarEnRaiz(this.drive, o.id_origen, raiz);
        if (!f || f.md5Checksum !== v.md5) continue;
        if (f.size && Number(f.size) > maxBytes) throw new HttpException('Archivo demasiado grande para la vista previa', HttpStatus.PAYLOAD_TOO_LARGE);
        const dl = await this.drive.descargar(o.id_origen);
        const partes: Buffer[] = [];
        let total = 0;
        for await (const ch of dl.stream) { const b = Buffer.from(ch); total += b.length; if (total > maxBytes) throw new HttpException('Archivo demasiado grande para la vista previa', HttpStatus.PAYLOAD_TOO_LARGE); partes.push(b); }
        return { buf: Buffer.concat(partes), mime: o.mime ?? '', origen: 'DRIVE' };
      } catch (e) {
        if (e instanceof HttpException) throw e;
        transitorio = true;
      }
    }
    throw sinFuente(transitorio);
  }

  private cabeceras(res: any, v: any, origen: string, extra: Record<string, string>) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro(v.documento.nombre)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Origen-Documento', origen);
    res.setHeader('X-Version-Documento', String(v.numero));
    for (const [k, val] of Object.entries(extra)) res.setHeader(k, val);
  }

  private async local(o: any, v: any, rangoHeader: string | undefined, res: any): Promise<boolean> {
    const real = await resolverDentro(docsDir(), o.id_origen);
    if (!real) return false;
    const st = await fs.promises.stat(real);
    // Si el archivo cambió desde la indexación no se sirve como esta versión.
    if (o.tamano != null && BigInt(st.size) !== o.tamano) return false;
    const r = parsearRango(rangoHeader, st.size);
    if (r === 'INVALIDO') { res.status(416).setHeader('Content-Range', `bytes */${st.size}`); res.end(); return true; }
    if (r) {
      res.status(206);
      this.cabeceras(res, v, 'LOCAL', { 'Content-Range': `bytes ${r.inicio}-${r.fin}/${st.size}`, 'Content-Length': String(r.fin - r.inicio + 1) });
      await this.canalizar(fs.createReadStream(real, { start: r.inicio, end: r.fin }), res);
    } else {
      this.cabeceras(res, v, 'LOCAL', { 'Content-Length': String(st.size) });
      await this.canalizar(fs.createReadStream(real), res);
    }
    return true;
  }

  private async enDrive(o: any, v: any, rangoHeader: string | undefined, res: any): Promise<boolean> {
    const raiz = driveRootId();
    if (!raiz || !this.drive.configurado()) return false;
    const f = await verificarEnRaiz(this.drive, o.id_origen, raiz);
    if (!f || f.md5Checksum !== v.md5) return false; // fuera de raíz, papelera, revocado o cambiado
    const rango = rangoHeader && /^bytes=\d*-\d*$/.test(rangoHeader.trim()) ? rangoHeader.trim() : undefined;
    const dl = await this.drive.descargar(o.id_origen, rango);
    res.status(dl.status);
    const extra: Record<string, string> = {};
    if (dl.headers['content-length']) extra['Content-Length'] = dl.headers['content-length'];
    if (dl.headers['content-range']) extra['Content-Range'] = dl.headers['content-range'];
    this.cabeceras(res, v, 'DRIVE', extra);
    await this.canalizar(dl.stream, res);
    return true;
  }

  private canalizar(stream: NodeJS.ReadableStream, res: any): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      res.on('close', resolve);
      res.on('finish', resolve);
      stream.pipe(res);
    });
  }
}
