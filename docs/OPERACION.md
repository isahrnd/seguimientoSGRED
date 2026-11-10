# Operación

## Acceso y roles

- Una única cuenta autorizada (`SEGUIMIENTO_USUARIO_ID`). Un rol no concede acceso. No hay cuenta del alcalde, ruta de invitado ni enlaces públicos a soportes.
- Cada petición valida la cookie `sgred_sid` (httpOnly, SameSite=Lax) contra la tabla `tbl_sesiones`; al cerrar sesión se borra en servidor. Sin sesión: 401. Otra cuenta: 403.
- `importaciones/validar` y `importaciones/aplicar` devuelven 403 a toda sesión HTTP. Solo se ejecutan con `importar-privados.js` dentro del servidor.
- Todas las respuestas llevan `Cache-Control: no-store`; el cierre de sesión envía `Clear-Site-Data: "cache"` para que «Atrás» no recupere datos.
- Con HTTPS, ponga `SEGUIMIENTO_COOKIE_SEGURA=true`.

## Importaciones privadas

Orden por dependencias (lo define `importaciones/manifiesto.json`): 1) índice documental (lo hace el propio script al reindexar), 2) expedientes y valores (`demoliciones.json`), 3) análisis de precios y asociaciones por edificio. Cada archivo se comprueba por SHA-256 antes de aplicarse; luego vista previa, aplicación, nueva vista previa (debe dar cero cambios) y segunda aplicación sin efecto.

Los archivos de análisis de precios (proceso 777) y de edificios confirman documentos que **solo están en Drive**; mientras Drive no esté vinculado la vista previa los rechaza («documentos no indexados») y no se aplica nada parcial.

## Google Drive

Lectura únicamente (`drive.readonly`); la aplicación nunca escribe en Drive. La identidad que lee Drive (token del servidor) es independiente de la cuenta que consulta la web.

1. Cree en Google Cloud un cliente OAuth «Aplicación de escritorio» y complete en `.env`: `SEGUIMIENTO_DRIVE_CLIENT_ID`, `SEGUIMIENTO_DRIVE_CLIENT_SECRET`, `SEGUIMIENTO_DRIVE_ROOT_ID` (carpeta raíz).
2. En el equipo con navegador: `cd backend && npm run contratacion:drive-vincular`. Abra la dirección que imprime con la cuenta que tiene lectura sobre la carpeta; guarda el token en `SEGUIMIENTO_DRIVE_TOKEN_FILE` (modo 0600).
3. Coloque ese token en `<privados>/.drive-token.json` y reinicie `api`. Pulse «Actualizar índice».

Si Drive falla, la interfaz sigue mostrando lo disponible, distingue «sin conexión» de «carpeta vacía» e indica la última lectura correcta.

## Sincronización

Cada `SEGUIMIENTO_SYNC_MINUTOS` (30 por defecto, 5–1440, 0 desactiva). «Actualizar índice» reutiliza la operación en curso, muestra el avance y el resultado por fuente y refresca la biblioteca y los expedientes sin recargar ni perder filtros.

## Historial de cifras

Cuando cambia el valor de una celda de Excel o el PDF que respaldaba una cifra, se crea una alerta con el valor anterior y el nuevo. **Limitación:** se conserva el valor previo de la celda y los metadatos de la versión, no una copia del archivo Excel antiguo; solo se ofrece «Ver versión anterior» cuando esa versión existe en el índice.

## OCR local

Orden de lectura: ruta y nombre → texto nativo del PDF o celdas de Excel → OCR local solo de las páginas **sin texto nativo** (documento escaneado). Usa Tesseract (español) y Poppler dentro de la imagen de la API; nada sale del servidor. El resultado se guarda por versión y página en `tbl_contratacion_ocr_paginas` y no se repite en reindexados posteriores. Se desactiva con `SEGUIMIENTO_OCR=false`; el idioma se cambia con `SEGUIMIENTO_OCR_IDIOMA`.

Prueba real sobre un PDF ficticio solo-imagen: `docker compose run --rm --no-deps -T -v ./backend/scripts:/t:ro api node /t/ocr-verificacion.js`. Las 3 PDF reales actuales tienen texto nativo, por lo que el OCR no se activó con ellos; cuando llegue un escaneado de Drive se aplicará en el siguiente reindexado.

## Acceso fuera de la red interna

No se publica nada en hosting público. Siguiente paso: dominio institucional con HTTPS delante del servicio `web` (proxy inverso que solo reenvíe a 3310), `SEGUIMIENTO_COOKIE_SEGURA=true`, y acceso restringido (VPN o lista de IP institucionales) aprobado por infraestructura. La API no debe exponerse directamente.

## Copias

Los datos viven en el volumen Docker `seguimiento-sgred_sgred_pgdata`. Respáldelo con `pg_dump` hacia una carpeta privada fuera de Git.
