# Seguimiento SGRED

Aplicación web privada de consulta del seguimiento de contratación de demoliciones e izaje con grúas. Es independiente de INFOGRED: base de datos, sesiones, puertos y volúmenes propios.

- `backend/`: API NestJS + Prisma (PostgreSQL). Código del módulo Monitoreo de contratación trasladado de INFOGRED y el mínimo de autenticación (sesión validada en servidor).
- `frontend/`: Next.js 15 + Ant Design con tema central (`frontend/src/theme/theme.ts`).
- `docs/`: [operación](docs/OPERACION.md) y [matriz de paridad](docs/PARIDAD.md).

El repositorio es **público**: no contiene documentos, importaciones, texto extraído, credenciales ni tokens. Todo eso vive fuera de Git.

## Arranque en otro equipo

Requisitos: Docker con Compose, Node 22 (solo para crear usuarios fuera de Docker).

```bash
cp .env.example .env        # complete POSTGRES_PASSWORD y SGRED_PRIVADOS_DIR
docker compose up -d --build
```

Abra http://127.0.0.1:3310. Los puertos solo se publican en 127.0.0.1.

### Crear la cuenta de consulta

```bash
docker compose run --rm --no-deps -T api node dist/scripts/usuarios-cli.js crear correo@ejemplo.org "Nombre"
```

Imprime el `id` y una contraseña generada (se muestra una sola vez). Ponga ese `id` en `SEGUIMIENTO_USUARIO_ID` de `.env` y ejecute `docker compose up -d`. Sin ese valor el módulo queda cerrado para todos.

## Documentos privados (separado de los secretos)

`SGRED_PRIVADOS_DIR` apunta a una carpeta **fuera del repositorio** que se monta en solo lectura en `/privados`:

```
<privados>/contrataciones/     PDF y Excel originales
<privados>/importaciones/      JSON de importación + manifiesto.json (SHA-256)
<privados>/.drive-token.json   token de lectura de Drive (opcional)
```

Importar (vista previa, aplicación y repetición sin duplicados):

```bash
docker compose run --rm --no-deps -T api node dist/scripts/importar-privados.js
```

## Secretos y Google Drive

Ver [docs/OPERACION.md](docs/OPERACION.md#google-drive). Sin credenciales de Drive la aplicación funciona con la carpeta local y muestra «Drive sin configurar».

## Desarrollo y pruebas

```bash
cd backend  && npm ci && npx prisma generate && npx jest          # unitarias; integración con CONTRATACION_TEST_DATABASE_URL (BD desechable local)
cd frontend && npm ci && npm run typecheck && npm test
```

## Acceso fuera de la red interna

Fuera del alcance de esta versión. Ver el siguiente paso concreto en [docs/OPERACION.md](docs/OPERACION.md#acceso-fuera-de-la-red-interna).
