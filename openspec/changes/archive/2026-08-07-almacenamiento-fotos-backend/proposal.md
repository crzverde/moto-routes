## Why

Las fotos de una ruta hoy solo existen en el dispositivo (filesystem local vía Tauri, o `data:` en memoria en navegador) — `rutas-en-la-nube` (ADR-040) subió explícitamente solo metadatos/puntos/paradas, dejando dos `// TODO` en `route-detail.element.ts` (líneas 433 y 508) marcando que la subida/borrado de fotos queda pendiente hasta que exista blob storage. El servidor de producción ya tiene MinIO provisionado desde antes (ADR-041) con un bucket `images` vacío y sin ningún código consumidor — es el momento de darle su primer uso real. Este cambio cubre **solo el backend**: subir, listar, descargar y borrar fotos de una ruta vía API, verificado con `curl`. La integración en `apps/mobile` (cerrar los dos TODO) queda para un cambio posterior.

## What Changes

- Nuevo paquete `apps/api/internal/photos/`: dominio de fotos de ruta, `BlobStore` (interfaz propia sobre MinIO vía `minio-go`) y `PostgresPhotoStore` (metadatos).
- Nueva tabla `route_photos` (migración): id (UUID cliente-generado, mismo patrón que `routes.id`), `route_id` (FK `ON DELETE CASCADE`), `object_key`, `mime_type`, `latitude`/`longitude`, `captured_at`, `created_at`.
- **Cifrado en reposo a nivel de aplicación**: cada foto se cifra (AES-256-GCM, `crypto/aes`/`crypto/cipher` de la librería estándar de Go) antes de subirla a MinIO, y se descifra al servirla — la clave (`PHOTO_ENCRYPTION_KEY`) vive solo en `apps/api`, nunca en MinIO ni en su almacenamiento. Un compromiso de las credenciales o del disco de MinIO por sí solo no basta para ver las fotos.
- Cuatro endpoints nuevos bajo `/api/routes/{id}/photos`, todos tras `RequireAuth` + comprobación de que la ruta pertenece al usuario autenticado (mismo guard que `GetByIDForUser`):
  - `POST /api/routes/{id}/photos` — sube una foto (`multipart/form-data`).
  - `GET /api/routes/{id}/photos` — lista metadatos (sin bytes).
  - `GET /api/routes/{id}/photos/{photoId}` — descarga los bytes de una foto (proxied, nunca una URL directa de MinIO).
  - `DELETE /api/routes/{id}/photos/{photoId}` — borra de MinIO y de metadatos.
- Límites server-side nuevos (hoy solo existen en el cliente): máximo 100 fotos por ruta (ya limitado en `apps/mobile`, `MAX_PHOTOS_PER_ROUTE`), máximo 15MB por foto.
- Nuevo contenedor de servicio `minio` en `.github/workflows/ci.yml` (mismo patrón que el `postgres` ya existente) y en `infra/docker/docker-compose.yml`, para poder testear `BlobStore` contra un MinIO real en CI y en desarrollo local.
- Nueva ADR documentando la decisión de cifrado y el primer uso real de MinIO (sustituye el estado "sin consumidor" de ADR-041).

**Fuera de alcance de este cambio** (explícito): integración en `apps/mobile` (cerrar los dos `// TODO`), borrado de una ruta completa (el endpoint `DELETE /api/routes/{id}` no existe todavía — nada que limpiar en cascada hasta que exista), borrado de cuenta.

## Capabilities

### New Capabilities
- `route-photo-storage`: subida, listado, descarga y borrado de fotos asociadas a una ruta, cifradas en reposo, servidas solo a través de la API autenticada.

### Modified Capabilities

_(Ninguna — no se toca el comportamiento ya especificado de `route-cloud-sync` ni `server-deployment`.)_

## Impact

- **`apps/api/internal/photos/`** (nuevo): `photos.go` (dominio), `blob_store.go` (interfaz + implementación MinIO), `postgres_photo_store.go`, `handler.go`, tests.
- **`apps/api/internal/migrate/migrations/0006_create_route_photos.sql`** (nueva).
- **`apps/api/internal/config/config.go`** — nuevas variables obligatorias: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `PHOTO_ENCRYPTION_KEY`.
- **`apps/api/cmd/api/main.go`** — cuatro rutas nuevas + wiring del `BlobStore`.
- **`apps/api/go.mod`** — nueva dependencia `github.com/minio/minio-go/v7`.
- **`.github/workflows/ci.yml`**, **`infra/docker/docker-compose.yml`** — contenedor de servicio `minio` nuevo.
- **`infra/docker/.env.prod.example`** — nuevas variables documentadas (nombres, nunca valores).
- **`memory/decisions.md`** — ADR nueva.
- **Servidor de producción** — no se toca hasta desplegar este cambio real (verificación con `curl` en tasks.md); las credenciales reales (`MINIO_ACCESS_KEY`/`SECRET_KEY` de un usuario dedicado, no el root de MinIO, y `PHOTO_ENCRYPTION_KEY`) se añaden a `.env.prod` del servidor, nunca versionadas.
- **Sin impacto** en `apps/mobile` (los dos `// TODO` quedan intactos, para un cambio posterior) ni en los endpoints ya existentes de `internal/routes/`.
