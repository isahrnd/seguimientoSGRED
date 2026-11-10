import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from 'libs/core/services/prisma.service';
import { hashPassword, verifyPassword } from './password';

export const COOKIE_SESION = 'sgred_sid';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** Hash válido para igualar el tiempo de respuesta cuando el correo no existe. */
const HASH_FALSO = hashPassword(crypto.randomBytes(8).toString('hex'));

export function horasSesion(): number {
  const n = Number(process.env.SEGUIMIENTO_SESION_HORAS ?? 8);
  return Number.isFinite(n) && n >= 1 && n <= 72 ? n : 8;
}

@Injectable()
export class AuthService {
  private intentos = new Map<string, { n: number; hasta: number }>();
  constructor(private readonly prisma: PrismaService) {}

  /** Freno simple por IP+correo: 8 fallos => 5 minutos de espera. */
  private bloqueado(k: string): boolean {
    const e = this.intentos.get(k);
    return !!e && e.n >= 8 && e.hasta > Date.now();
  }
  private fallo(k: string) {
    const e = this.intentos.get(k);
    const ahora = Date.now();
    if (!e || e.hasta < ahora) this.intentos.set(k, { n: 1, hasta: ahora + 5 * 60_000 });
    else e.n += 1;
  }

  async iniciar(correo: string, password: string, ip: string): Promise<{ token: string; expira: Date; usuario: { id: number; nombre: string; correo: string } }> {
    const clave = `${ip}|${String(correo).toLowerCase()}`;
    if (this.bloqueado(clave)) throw new UnauthorizedException('Demasiados intentos. Espere unos minutos.');
    const u = typeof correo === 'string' && typeof password === 'string'
      ? await this.prisma.usuarios.findUnique({ where: { correo: correo.trim().toLowerCase() } })
      : null;
    const ok = verifyPassword(String(password ?? ''), u?.password_hash ?? HASH_FALSO);
    if (!u || !u.estado || !ok) {
      this.fallo(clave);
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    this.intentos.delete(clave);
    const token = crypto.randomBytes(32).toString('base64url');
    const expira = new Date(Date.now() + horasSesion() * 3_600_000);
    await this.prisma.sesiones.create({ data: { token_hash: sha(token), usuario_id: u.id, expira_en: expira } });
    await this.prisma.sesiones.deleteMany({ where: { expira_en: { lt: new Date() } } });
    return { token, expira, usuario: { id: u.id, nombre: u.nombre, correo: u.correo } };
  }

  /** Valida la cookie contra la BD en cada petición (revocable de inmediato). */
  async validar(token: string | undefined): Promise<{ id: number; nombre: string; correo: string } | null> {
    if (!token || token.length > 200) return null;
    const s = await this.prisma.sesiones.findUnique({ where: { token_hash: sha(token) }, include: { usuario: true } });
    if (!s || s.expira_en < new Date() || !s.usuario.estado) return null;
    return { id: s.usuario.id, nombre: s.usuario.nombre, correo: s.usuario.correo };
  }

  async cerrar(token: string | undefined): Promise<void> {
    if (token) await this.prisma.sesiones.deleteMany({ where: { token_hash: sha(token) } });
  }
}
