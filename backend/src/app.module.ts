import { Controller, Get, Module, SetMetadata } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from 'libs/core/services/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SesionGuard, RUTA_PUBLICA } from './auth/sesion.guard';
import { MonitoreoContratacionModule } from './contratacion/monitoreo-contratacion.module';
import { ContratacionAccesoService } from './contratacion/contratacion-acceso.guard';

@Controller('salud')
class SaludController {
  @SetMetadata(RUTA_PUBLICA, true)
  @Get()
  ok() {
    return { ok: true };
  }
}

@Module({
  imports: [MonitoreoContratacionModule],
  controllers: [AuthController, SaludController],
  providers: [PrismaService, AuthService, ContratacionAccesoService, { provide: APP_GUARD, useClass: SesionGuard }],
})
export class AppModule {}
