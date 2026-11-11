import { compararEdificio } from './contratacion-edificios-match';
import { analizarPartidas } from './contratacion-partidas';

/**
 * Vista de lo que la lectura asistida extrajo de los documentos, para fichas de expediente y de edificio.
 * Muestra la última lectura aceptada de cada documento con su página y cita, y compara los edificios que cita una tabla con los
 * registrados y con los vinculados al documento. Todo queda «por verificar»: nada de esto confirma una asociación ni entra en los totales.
 */
export async function vistaLecturaAsistida(prisma: any, filtroVersion: Record<string, unknown>) {
  const filas = await prisma.contratacionIaExtraccion.findMany({
    where: { estado: { in: ['OK', 'NATIVO'] }, version: { vigente: true, ...filtroVersion } },
    include: { version: { include: { documento: { include: { edificios: true } } } } },
    orderBy: { id: 'asc' },
  });
  // Una sola lectura por versión: la más reciente.
  const ultima = new Map<number, any>();
  for (const f of filas) if (f.resultado) ultima.set(f.version_id, f);
  if (ultima.size === 0) return [];
  const edificios: Array<{ id: number; nombre: string }> = await prisma.contratacionEdificio.findMany({ select: { id: true, nombre: true } });

  return [...ultima.values()].map((x) => {
    const r: any = x.resultado ?? {};
    const vinculados = new Set<number>(x.version.documento.edificios.map((e: any) => e.edificio_id));
    const registrados = edificios.map((e) => ({ id: e.id, nombre: e.nombre, vinculado: vinculados.has(e.id) }));
    const analisis = analizarPartidas((r.partidas ?? []).map((p: any) => ({ edificio: p.edificio ?? null, alcance: p.alcance, importe: p.importe, pagina: p.pagina, nivel: p.nivel })));
    const partidas = (r.partidas ?? []).map((p: any, i: number) => ({ ...p, nivel: analisis.partidas[i].nivel, coincidencia: p.edificio ? compararEdificio(p.edificio, registrados) : null }));
    const enTabla = [...new Set(partidas.map((p: any) => p.edificio).filter(Boolean))] as string[];
    const sinVinculo = enTabla.filter((nombre) => {
      const c = partidas.find((p: any) => p.edificio === nombre)?.coincidencia;
      return !c || c.estado === 'SIN_COINCIDENCIA' || c.vinculado_al_documento === false;
    });
    return {
      version_id: x.version_id,
      documento: x.version.documento.nombre,
      campos: Object.entries(r.campos ?? {}).map(([campo, c]: [string, any]) => ({ campo, valor: c.valor, pagina: c.pagina, cita: c.cita, fuente: c.fuente ?? null })),
      coincidencia_edificio: r.campos?.edificio?.valor ? compararEdificio(r.campos.edificio.valor, registrados) : null,
      controles_aritmeticos: r.controles_aritmeticos ?? [],
      partidas,
      controles_de_suma: analisis.controles,
      suma_solo_partidas: analisis.suma_solo_partidas,
      origen: r.nativo ? 'NATIVA' : r.hoja_calculo ? 'HOJA_DE_CALCULO' : 'ASISTIDA',
      trazabilidad: r.trazabilidad ?? null,
      no_encontrados: r.no_encontrados ?? [],
      edificios_en_tabla: enTabla.length,
      edificios_vinculados_al_documento: vinculados.size,
      edificios_sin_vinculo: sinVinculo,
      descartados: ((x.descartes as any[]) ?? []).length,
    };
  }).filter((x) => x.campos.length > 0 || x.partidas.length > 0 || x.no_encontrados.length > 0);
}
