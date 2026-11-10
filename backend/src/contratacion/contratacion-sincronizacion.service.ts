import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'libs/core/services/prisma.service';
import { sincronizacionMinutos, usuarioAutorizadoId } from './contratacion.config';
import { ContratacionIndiceService } from './contratacion-indice.service';

const TIPO = 'SINCRONIZACION';

/**
 * Sincronización periódica de fuentes (carpeta local y Drive, solo lectura) con el índice documental.
 * Reutiliza el mismo reindexado que el botón manual; el botón sigue disponible.
 * No corre si el módulo no está habilitado (sin usuario autorizado) ni si hay una actualización en curso.
 */
@Injectable()
export class ContratacionSincronizacionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ContratacionSincronizacionService.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService, private readonly indice: ContratacionIndiceService) {}

  onModuleInit() {
    const min = sincronizacionMinutos();
    if (min === 0 || usuarioAutorizadoId() === null) return;
    this.temporizador = setInterval(() => void this.ejecutar(), min * 60_000);
    this.temporizador.unref();
    // Primera pasada poco después de arrancar, para no esperar un intervalo completo tras un despliegue.
    setTimeout(() => void this.ejecutar(), 60_000).unref();
    this.log.log(`Sincronización periódica de contratación activa cada ${min} min`);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Una pasada. Nunca lanza: un fallo se registra como estado ERROR sin tocar datos existentes. */
  async ejecutar(): Promise<'OK' | 'OCUPADO' | 'ERROR' | 'DESACTIVADA'> {
    if (usuarioAutorizadoId() === null) return 'DESACTIVADA';
    if (this.indice.ocupado) return 'OCUPADO';
    const ahora = new Date();
    try {
      const r = await this.indice.reindexar({ confirmarVacia: false, origen: 'AUTOMATICA' });
      // Éxito de la pasada = ninguna fuente configurada terminó en ERROR (una fuente VACIA no es un fallo de conexión).
      const fallas = [r.local, r.drive].filter((x) => x.estado === 'ERROR');
      if (fallas.length) throw new Error(`Falló la conexión o lectura de ${fallas.length === 2 ? 'ambas fuentes' : r.local.estado === 'ERROR' ? 'la carpeta local' : 'Google Drive'}`);
      await this.registrar('CORRECTA', ahora, `local: ${r.local.estado} (${r.local.total}); drive: ${r.drive.estado} (${r.drive.total})`, true);
      return 'OK';
    } catch (e) {
      await this.registrar('ERROR', ahora, (e as Error).message.slice(0, 200), false);
      return 'ERROR';
    }
  }

  private async registrar(estado: string, ahora: Date, detalle: string, correcta: boolean) {
    try {
      await this.prisma.contratacionFuenteEstado.upsert({
        where: { tipo: TIPO },
        create: { tipo: TIPO, estado, ultimo_intento: ahora, ultima_correcta: correcta ? ahora : null, detalle },
        update: { estado, ultimo_intento: ahora, detalle, ...(correcta ? { ultima_correcta: ahora } : {}) },
      });
    } catch (e) {
      this.log.warn(`No se pudo registrar el estado de la sincronización: ${(e as Error).message}`);
    }
  }

  /** Lo que ve la interfaz: si es automática, cada cuánto y cuándo fue la última pasada correcta. */
  async estado() {
    const x = await this.prisma.contratacionFuenteEstado.findUnique({ where: { tipo: TIPO } });
    const min = sincronizacionMinutos();
    const activa = min > 0 && usuarioAutorizadoId() !== null;
    return {
      automatica: activa,
      intervalo_minutos: activa ? min : null,
      estado: x?.estado ?? (activa ? 'PENDIENTE_PRIMERA_PASADA' : 'DESACTIVADA'),
      ultimo_intento: x?.ultimo_intento ?? null,
      ultima_correcta: x?.ultima_correcta ?? null,
      detalle: x?.detalle ?? null,
      proxima_estimada: activa && x?.ultimo_intento ? new Date(x.ultimo_intento.getTime() + min * 60_000) : null,
    };
  }
}
