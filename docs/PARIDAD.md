# Matriz de paridad con el módulo de INFOGRED

Origen de referencia (solo lectura, no modificado):

| Parte | Rama / revisión | SHA |
|---|---|---|
| Backend | `origin/stage` (incluye importador privado de stage, #271) | `74b526e` |
| Frontend | `feature/contratacion-analisis-precios` (aún no está en `stage`) | `1caca7c` |

El frontend más reciente (Análisis de precios y «Actualizar índice») solo existe en esa rama; el frontend de `stage` está en `f8dbbe2`.

| Funcionalidad | Origen | Destino | Prueba de paridad |
|---|---|---|---|
| Listado y filtros de expedientes | `contratacion-consulta.service` / `demoliciones/page` | mismo servicio; `components/expedientes-lista.tsx` | Navegador con datos reales (3 expedientes) |
| Búsqueda | proceso, intervención, edificación | **ampliada**: también empresas y sectores, sin distinguir tildes | Navegador: MOLINO |
| Detalle de expediente (necesidad, cotizaciones, sector, contratación, ejecución) | `demoliciones/[id]` | `expedientes/[id]` | Navegador |
| Análisis de precios por expediente y global | `contratacion-precios` + vistas | mismo servicio; `analisis-precios`, `components/analisis-precios.tsx` | Jest (precios) + navegador |
| Comparación de cotizaciones y alcance | `comparacion-cotizaciones.tsx` | `components/comparacion-cotizaciones.tsx` | Jest (comparación) + navegador |
| Edificaciones y resoluciones | `contratacion-edificios.service` | mismo servicio; `edificaciones`, `edificios-soportes.tsx` | Jest integración (datos ficticios); real pendiente de Drive |
| Biblioteca de documentos, vistas y filtros | `contratacion-biblioteca.service` | mismo servicio; `documentos/page.tsx` | Navegador con datos reales |
| Visor PDF por página | iframe `#page=` | igual, privado | Navegador: página 69 |
| Visor Excel por hoja/celda con recorte | `hoja/[versionId]` | `documentos/hoja/[versionId]` | Jest integración; navegador pendiente de un Excel real |
| Clasificación, deduplicación, orígenes | `clasificador`, `sugerencias`, `indice.service` | idénticos | Jest (105 pruebas) |
| Sincronización y «Actualizar índice» | `sincronizacion.service`, `reindexar` | idénticos + `IndiceControl` | Navegador con fuente local controlada |
| Alertas de cifra cambiada | `contratacion-cambios` | idéntico | Jest integración |
| Importación privada (SHA-256, vista previa, repetición) | `scripts/stage-importar-contratacion.js` | `scripts/importar-privados.ts` | Ejecutada dos veces en contenedor |
| Cliente Drive de solo lectura | `contratacion-drive.client` | idéntico | Jest con Drive falso; real pendiente de consentimiento |
| 403 a importaciones HTTP | `ContratacionSoloOperacionGuard` | idéntico | API: 403 |
| Autorización por id estable | JWT de INFOGRED + id configurado | sesión propia en servidor + `SEGUIMIENTO_USUARIO_ID` | API: 401 / 403 / logout |

## Diferencias conocidas

- Variables de entorno renombradas de `INFOGRED_CONTRATACION_*` a `SEGUIMIENTO_*`.
- Autenticación: cuentas y sesiones propias (`tbl_usuarios`, `tbl_sesiones`) en lugar del JWT de INFOGRED.
- Interfaz nueva (Ant Design, pantalla ejecutiva, síntesis económica de cinco valores, gráfico de precios unitarios equivalentes).
- Búsqueda ampliada a empresas y sectores.
- OCR local por página y versión añadido (no estaba implementado en el origen para este flujo).
- Pendiente: vinculación de Drive (por tanto proceso 777, Edificio Ejemplo, comparativo general y 29 documentos de Drive no están cargados con datos reales).
