import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { ContratacionAccesoGuard, ContratacionSoloOperacionGuard } from './contratacion-acceso.guard';
import { MonitoreoContratacionController } from './monitoreo-contratacion.controller';

const ctx: any = { switchToHttp: () => ({ getResponse: () => ({ setHeader: () => undefined }), getRequest: () => ({ user: { id: 1 } }) }) };
const guardsDe = (nombre: string): unknown[] => Reflect.getMetadata('__guards__', (MonitoreoContratacionController.prototype as any)[nombre]) ?? [];

describe('importaciones reservadas a la operación del servidor', () => {
  it('el guard de operación rechaza siempre con 403, también a la cuenta autorizada', () => {
    expect(() => new ContratacionSoloOperacionGuard().canActivate(ctx)).toThrow(ForbiddenException);
  });
  it.each(['validar', 'aplicar'])('la ruta %s exige el acceso de consulta y además el guard de operación', (ruta) => {
    const g = guardsDe(ruta);
    expect(g).toEqual([ContratacionAccesoGuard, ContratacionSoloOperacionGuard]);
  });
  it('las rutas de lectura no llevan el guard de operación', () => {
    for (const ruta of ['listar', 'detalle', 'contenido', 'hoja', 'fuentes', 'reindexar']) {
      expect(guardsDe(ruta)).not.toContain(ContratacionSoloOperacionGuard);
      expect(guardsDe(ruta)).toContain(ContratacionAccesoGuard);
    }
  });
});
