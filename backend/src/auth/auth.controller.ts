import { Body, Controller, Get, HttpCode, Post, Req, Res, SetMetadata } from '@nestjs/common';
import { aplicarCabecerasPrivadas, ContratacionAccesoService } from '../contratacion/contratacion-acceso.guard';
import { AuthService, COOKIE_SESION, horasSesion } from './auth.service';
import { RUTA_PUBLICA } from './sesion.guard';

const opcionesCookie = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.SEGUIMIENTO_COOKIE_SEGURA === 'true',
  path: '/',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly acceso: ContratacionAccesoService) {}

  @SetMetadata(RUTA_PUBLICA, true)
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: any, @Req() req: any, @Res({ passthrough: true }) res: any) {
    aplicarCabecerasPrivadas(res);
    const r = await this.auth.iniciar(body?.correo, body?.password, req.ip ?? 'ip');
    res.cookie(COOKIE_SESION, r.token, { ...opcionesCookie(), maxAge: horasSesion() * 3_600_000 });
    return { usuario: r.usuario };
  }

  @SetMetadata(RUTA_PUBLICA, true)
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
    aplicarCabecerasPrivadas(res);
    await this.auth.cerrar(req.cookies?.[COOKIE_SESION]);
    res.clearCookie(COOKIE_SESION, opcionesCookie());
    res.setHeader('Clear-Site-Data', '"cache"');
    return { ok: true };
  }

  @Get('yo')
  async yo(@Req() req: any, @Res({ passthrough: true }) res: any) {
    aplicarCabecerasPrivadas(res);
    return { usuario: req.user, autorizado: await this.acceso.esAutorizado(req.user) };
  }
}
