import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ContratacionAccesoGuard, ContratacionAccesoService, ContratacionSoloOperacionGuard, aplicarCabecerasPrivadas,
} from './contratacion-acceso.guard';
import { ContratacionBibliotecaService } from './contratacion-biblioteca.service';
import { ContratacionConsultaService } from './contratacion-consulta.service';
import { ContratacionEdificiosService } from './contratacion-edificios.service';
import { ContratacionDocumentosService } from './contratacion-documentos.service';
import { ContratacionImportacionService } from './contratacion-importacion.service';
import { ContratacionIndiceService } from './contratacion-indice.service';
import { ContratacionSincronizacionService } from './contratacion-sincronizacion.service';

/**
 * Todas las rutas (salvo `acceso`, que solo responde un booleano sobre la propia sesión)
 * pasan por ContratacionAccesoGuard ANTES de tocar BD, disco o Drive.
 * Sin @Public(): el JwtAuthGuard global exige sesión vigente.
 */
@Controller('monitoreo-contratacion')
export class MonitoreoContratacionController {
  constructor(
    private readonly acceso: ContratacionAccesoService,
    private readonly consulta: ContratacionConsultaService,
    private readonly edificios: ContratacionEdificiosService,
    private readonly biblioteca: ContratacionBibliotecaService,
    private readonly documentos: ContratacionDocumentosService,
    private readonly indice: ContratacionIndiceService,
    private readonly sincronizacion: ContratacionSincronizacionService,
    private readonly importacion: ContratacionImportacionService,
  ) {}

  /** Para el menú: no revela datos; solo si la sesión actual es la cuenta autorizada. */
  @Get('acceso')
  async verAcceso(@Req() req: any, @Res({ passthrough: true }) res: any) {
    aplicarCabecerasPrivadas(res);
    return { autorizado: await this.acceso.esAutorizado(req.user) };
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('expedientes')
  listar(@Query('q') q?: string, @Query('intervencion') intervencion?: string, @Query('empresa') empresa?: string, @Query('estado') estado?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.consulta.listar({ q, intervencion, empresa, estado, desde, hasta });
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('edificios')
  listarEdificios(@Query('q') q?: string) {
    return this.edificios.listar(q);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('edificios/:id')
  detalleEdificio(@Param('id', ParseIntPipe) id: number) {
    return this.edificios.detalle(id);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('comparar')
  comparar(@Query('a', ParseIntPipe) a: number, @Query('b', ParseIntPipe) b: number) {
    return this.consulta.comparar(a, b);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('expedientes/:id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.consulta.detalle(id);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('documentos')
  biblioteca_listar(
    @Query('vista') vista?: string, @Query('q') q?: string, @Query('categoria') categoria?: string, @Query('formato') formato?: string,
    @Query('edificacion') edificacion?: string, @Query('origen') origen?: string, @Query('expediente') expediente?: string,
    @Query('pagina') pagina?: string, @Query('tam') tam?: string,
  ) {
    return this.biblioteca.listar({ vista, q, categoria, formato, edificacion, origen, expediente, pagina: pagina ? Number(pagina) : undefined, tam: tam ? Number(tam) : undefined });
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('documentos/:versionId/hoja')
  hoja(@Param('versionId', ParseIntPipe) versionId: number, @Query('indice') indice?: string) {
    return this.biblioteca.hoja(versionId, indice ? Number(indice) : 0);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('documentos/pendientes')
  pendientes() {
    return this.consulta.pendientes();
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('documentos/:versionId/contenido')
  async contenido(@Param('versionId', ParseIntPipe) versionId: number, @Headers('range') range: string | undefined, @Res() res: any) {
    await this.documentos.servir(versionId, range, res);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('analisis-precios')
  analisisPrecios() {
    return this.consulta.analisisPrecios();
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('exportar/resumen-contratos')
  async exportarResumen(@Res() res: any) {
    const libro = await this.consulta.resumenPorContrato();
    aplicarCabecerasPrivadas(res);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="resumen-por-contrato.xlsx"');
    res.end(libro);
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('fuentes')
  fuentes() {
    return this.consulta.fuentes();
  }

  /** Actualización manual: responde enseguida (202) con el trabajo; la interfaz lo sigue con GET reindexar/estado. */
  @UseGuards(ContratacionAccesoGuard)
  @Post('reindexar')
  @HttpCode(202)
  reindexar() {
    return this.indice.iniciar('MANUAL');
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('reindexar/estado')
  estadoReindexado() {
    return { trabajo: this.indice.estadoTrabajo() };
  }

  @UseGuards(ContratacionAccesoGuard)
  @Get('sincronizacion')
  estadoSincronizacion() {
    return this.sincronizacion.estado();
  }

  // Reservado a la operación del servidor: toda sesión HTTP recibe 403 (el acceso de consulta no incluye importar).
  @UseGuards(ContratacionAccesoGuard, ContratacionSoloOperacionGuard)
  @Post('importaciones/validar')
  validar(@Body() body: any) {
    return this.importacion.previsualizar(body);
  }

  @UseGuards(ContratacionAccesoGuard, ContratacionSoloOperacionGuard)
  @Post('importaciones/aplicar')
  aplicar(@Body() body: any, @Req() req: any) {
    return this.importacion.aplicar(body, req.user?.id ?? null);
  }
}
