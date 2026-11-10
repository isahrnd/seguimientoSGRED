import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, COOKIE_SESION } from './auth.service';

export const RUTA_PUBLICA = 'sgred:publica';

/** Guard global: toda ruta exige sesión vigente salvo las marcadas como públicas (login, salud). 401 sin sesión. */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(RUTA_PUBLICA, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.validar(req.cookies?.[COOKIE_SESION]);
    if (!user) throw new UnauthorizedException('Sesión no válida');
    req.user = user;
    return true;
  }
}
