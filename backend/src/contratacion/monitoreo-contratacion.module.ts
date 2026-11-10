import { Module } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { PrismaPrivadoService } from 'libs/core/services/prisma-privado.service';
import { ContratacionAccesoGuard, ContratacionAccesoService } from './contratacion-acceso.guard';
import { ContratacionBibliotecaService } from './contratacion-biblioteca.service';
import { ContratacionConsultaService } from './contratacion-consulta.service';
import { CONTRATACION_DRIVE_CLIENT, DriveHttpClient } from './contratacion-drive.client';
import { ContratacionEdificiosService } from './contratacion-edificios.service';
import { ContratacionDocumentosService } from './contratacion-documentos.service';
import { ContratacionCotizacionesEdificioService } from './contratacion-cotizaciones-edificio.service';
import { ContratacionImportacionService } from './contratacion-importacion.service';
import { ContratacionIndiceService } from './contratacion-indice.service';
import { ContratacionSincronizacionService } from './contratacion-sincronizacion.service';
import { MonitoreoContratacionController } from './monitoreo-contratacion.controller';

@Module({
  controllers: [MonitoreoContratacionController],
  providers: [
    // Cliente Prisma sin registro de argumentos de consulta (datos privados).
    { provide: PrismaService, useClass: PrismaPrivadoService },
    { provide: CONTRATACION_DRIVE_CLIENT, useClass: DriveHttpClient },
    ContratacionAccesoService,
    ContratacionAccesoGuard,
    ContratacionConsultaService,
    ContratacionEdificiosService,
    ContratacionBibliotecaService,
    ContratacionDocumentosService,
    ContratacionImportacionService,
    ContratacionCotizacionesEdificioService,
    ContratacionIndiceService,
    ContratacionSincronizacionService,
  ],
  exports: [ContratacionIndiceService, ContratacionImportacionService, ContratacionCotizacionesEdificioService],
})
export class MonitoreoContratacionModule {}
