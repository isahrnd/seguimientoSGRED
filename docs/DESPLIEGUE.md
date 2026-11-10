# Despliegue en un servidor propio con Cloudflare Tunnel

Solo el frontend se publica, por HTTPS, a través de un túnel de Cloudflare (conexión saliente). La API y PostgreSQL no publican puertos.

## En el servidor

```bash
mkdir -p ~/seguimiento-sgred && cd ~/seguimiento-sgred
git clone https://github.com/isahrnd/seguimientoSGRED.git app && cd app
cp .env.example .env          # complete POSTGRES_PASSWORD, SGRED_PRIVADOS_DIR, SEGUIMIENTO_USUARIO_ID y los secretos de Drive
# además en .env:
#   SEGUIMIENTO_COOKIE_SEGURA=true
#   CLOUDFLARE_TUNNEL_TOKEN=<token del túnel>
docker compose -f docker-compose.yml -f docker-compose.produccion.yml up -d --build
```

- `SGRED_PRIVADOS_DIR` es una carpeta **fuera del clon** (documentos, importaciones y `.drive-token.json`); se monta en solo lectura.
- Todos los servicios usan `restart: unless-stopped` y el servicio Docker debe estar habilitado al arrancar (`systemctl enable docker`).
- El túnel apunta a `http://web:3310` (nombre del servicio en la red de Compose).

## Datos

1. En el origen: `pg_dump -Fc --exclude-table-data=tbl_sesiones` de la base `seguimiento_sgred` (las sesiones no se trasladan).
2. Traslado por SSH (`scp`) y comprobación de SHA-256.
3. En el destino (BD vacía con las migraciones ya aplicadas por la API): `pg_restore --clean --if-exists --no-owner -d seguimiento_sgred`.
4. Comprobar conteos (expedientes, documentos, versiones, edificios, cotizaciones por edificio, asociaciones) y el id de la cuenta autorizada.

## Verificación

Desde otra red: inicio de sesión, un PDF con página citada, una hoja con celda, un documento de Drive y «Actualizar índice». Sin sesión y con otra cuenta, el contenido de un documento responde 401 y 403.
