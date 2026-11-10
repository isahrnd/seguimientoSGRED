import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { usuarioAutorizadoId } from './contratacion.config';

/** Cabeceras para que ningún proxy, navegador ni buscador conserve estas respuestas. */
export function aplicarCabecerasPrivadas(res: any): void {
  if (!res?.setHeader) return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Autoriza SOLO por el id estable de la cuenta configurada en el servidor
 * (SEGUIMIENTO_USUARIO_ID). El id sale del JWT firmado, nunca de la
 * petición. Un rol (incluido administrador) no concede acceso. Sin configuración: cerrado.
 */
@Injectable()
export class ContratacionAccesoService {
  constructor(private readonly prisma: PrismaService) {}

  async esAutorizado(user: any): Promise<boolean> {
    const autorizado = usuarioAutorizadoId();
    if (autorizado === null) return false;
    const id = user?.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id !== autorizado) return false;
    // Revocación: la cuenta debe seguir activa en BD.
    const u = await this.prisma.usuarios.findUnique({ where: { id }, select: { id: true, estado: true } });
    return !!u && u.estado === true;
  }
}

/**
 * Las importaciones (validar y aplicar) son una operación del servidor, no de la sesión de consulta.
 * Ninguna sesión HTTP, ni la de la cuenta autorizada, puede ejecutarlas: se hacen con el mecanismo privado
 * (`npm run contratacion:importar`, que usa los servicios directamente, sin pasar por este guard).
 */
@Injectable()
export class ContratacionSoloOperacionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    aplicarCabecerasPrivadas(ctx.switchToHttp().getResponse());
    throw new ForbiddenException('Operación reservada al mecanismo privado de operación del servidor');
  }
}

@Injectable()
export class ContratacionAccesoGuard implements CanActivate {
  constructor(private readonly acceso: ContratacionAccesoService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    aplicarCabecerasPrivadas(http.getResponse());
    const req = http.getRequest();
    if (!(await this.acceso.esAutorizado(req.user))) {
      throw new ForbiddenException('Acceso no autorizado');
    }
    return true;
  }
}
