## Context

Ver `proposal.md` — Why. MinIO ya corre en el servidor de producción (ADR-041), solo en loopback `127.0.0.1:9000`, con un bucket `images` vacío y sin ningún consumidor. `apps/api` corre con `network_mode: host` en el mismo servidor, así que llega a ese loopback sin exponer nada nuevo. El patrón de `internal/routes/` (dominio + `Store` interface + `PostgresXStore` + `handler.go`, guard de propiedad `WHERE ... user_id = $2`) es el precedente directo a seguir para el nuevo dominio de fotos.

## Goals / Non-Goals

**Goals:**
- Subir/listar/descargar/borrar fotos de una ruta propia, cifradas en reposo, servidas solo vía la API autenticada.
- Testear `BlobStore` contra un MinIO real en CI/local (mismo criterio que `dbtest.Connect` contra Postgres real para `internal/routes/`), no un fake que enmascare problemas reales del SDK.

**Non-Goals:**
- Integración en `apps/mobile` (cerrar los `// TODO` de `route-detail.element.ts`) — cambio de frontend posterior.
- Borrado en cascada al borrar una ruta o una cuenta — ninguno de los dos endpoints existe todavía en `apps/api`; nada que limpiar hasta que existan.
- Miniaturas/redimensionado de imágenes — se almacena el fichero tal cual sube el cliente.
- Presigned URLs de MinIO — decisión explícita (ver D3), toda descarga pasa por la API.

## Decisions

### D1. `minio-go` (SDK oficial de MinIO) para el `BlobStore`
- **Decisión**: `github.com/minio/minio-go/v7`, cliente S3-compatible oficial y mantenido por MinIO. `BlobStore` es una interfaz propia (`Put(ctx, key, plaintext) error`, `Get(ctx, key) ([]byte, error)`, `Delete(ctx, key) error`) que envuelve el cliente — el resto del código nunca importa `minio-go` directamente, mismo aislamiento que `routes.Store` sobre `pgx`.
- **Alternativas**: `aws-sdk-go-v2` con el cliente S3 apuntando al endpoint de MinIO — funciona (MinIO es S3-compatible), pero es un SDK mucho más grande pensado para todo el ecosistema AWS; para un solo bucket y cuatro operaciones, `minio-go` es más ligero y es el que documenta el propio proyecto MinIO como cliente de referencia. Implementar el protocolo S3 a mano — descartado, iría contra la norma de "librería madura y auditada" para cualquier pieza de este calado.

### D2. Cifrado de aplicación con AES-256-GCM (`crypto/aes`+`crypto/cipher`, librería estándar de Go) — ver ADR-042
- **Decisión**: cada foto se cifra completa en memoria (no en streaming — a este tamaño, unos pocos MB, no compensa la complejidad de GCM en streaming con su tag de autenticación) antes de `Put`, y se descifra completa tras `Get`. Clave de 32 bytes (AES-256) en la variable de entorno `PHOTO_ENCRYPTION_KEY`, **codificada en base64** (un secreto binario de 32 bytes no sobrevive de forma fiable como texto plano en todos los entornos que leen `.env*`) — `config.Load()` decodifica y valida que la longitud resultante sea exactamente 32 bytes, fallando el arranque si no. Un nonce aleatorio de 12 bytes (`crypto/rand`) se genera por foto y se antepone al ciphertext almacenado (no es secreto, solo debe no repetirse con la misma clave — GCM lo exige).
- **Alternativas**: SSE-S3 nativo de MinIO (cifrado gestionado por el propio MinIO) — descartada porque la clave y los datos cifrados terminarían viviendo en el mismo sistema (MinIO gestiona su propio KMS); el objetivo es que un compromiso de MinIO por sí solo (credenciales o disco) no baste para ver las fotos, y eso exige que la clave viva en un sitio distinto (`apps/api`, ya con su propio secreto separado `AUTH_TOKEN_SECRET`). Cifrado en streaming — descartado, complejidad innecesaria para el tamaño real de estos ficheros (fotos de cámara de móvil, unos pocos MB).

### D3. Ninguna foto se sirve por URL directa de MinIO — siempre proxied por la API — ver ADR-042
- **Decisión**: `GET /api/routes/{id}/photos/{photoId}` descarga de MinIO, descifra, y escribe los bytes en la respuesta HTTP — nunca genera ni expone una presigned URL de MinIO. Así toda descarga pasa por `RequireAuth` + comprobación de propiedad de la ruta en cada petición.
- **Alternativas**: presigned URLs de MinIO con TTL corto — descartadas: una URL filtrada (log, proxy, captura de pantalla del navegador) sigue funcionando sin ningún control nuestro hasta que expira: exactamente el escenario que el cifrado en reposo (D2) intenta evitar por el lado del almacenamiento, así que hacerlo por el lado del acceso sería inconsistente.

### D4. Tabla `route_photos` — mismo patrón que `routes`/`route_points`
- **Decisión**: `id UUID PRIMARY KEY` (cliente-generado, mismo criterio que `routes.id`), `route_id` con `REFERENCES routes(id) ON DELETE CASCADE`, `object_key TEXT NOT NULL` (ej. `routes/{routeId}/{photoId}`), `mime_type TEXT NOT NULL`, `latitude`/`longitude DOUBLE PRECISION` (nullable, igual que en `routes`), `captured_at TEXT NOT NULL` (igual que `routes.created_at`: se preserva el string ISO exacto del cliente, no se reinterpreta como `TIMESTAMPTZ`), `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- El `object_key` incluye `route_id` pero no `user_id` — la propiedad se resuelve siempre vía `route_id` contra la tabla `routes` (que sí tiene `user_id`), nunca duplicando esa comprobación en la tabla de fotos.

### D5. Límites server-side: 100 fotos/ruta, 15MB/foto
- **Decisión**: replican el límite ya existente en el cliente (`MAX_PHOTOS_PER_ROUTE = 100`) más un límite de tamaño nuevo (15MB, margen holgado sobre un JPEG de cámara de móvil moderno) — hoy ninguno de los dos se aplica en el servidor. Body máximo del `multipart/form-data` limitado con `http.MaxBytesReader` antes de leer el fichero, para no materializar en memoria una subida abusivamente grande antes de rechazarla.

### D6. MinIO real en CI y en `docker-compose.yml` de desarrollo — `docker run` manual, no un *service container* declarativo
- **Decisión**: el test de `BlobStore` necesita un MinIO real, igual que `dbtest.Connect` necesita un Postgres real para `internal/routes/`. En `.github/workflows/ci.yml` esto se levanta con un paso `docker run minio/minio server /data ...` explícito (no la sección declarativa `services:`, a diferencia de `postgres`) porque el bloque `services:` de GitHub Actions no admite pasar argumentos de comando (`server /data`), y la imagen oficial `minio/minio` los exige — sin ellos el contenedor solo imprime el uso y termina. El paso espera con un bucle `curl` contra `/minio/health/live` desde el propio runner (no un healthcheck *dentro* del contenedor) antes de continuar. En `infra/docker/docker-compose.yml` sí se usa un servicio normal, ya que Compose sí admite `command:`.
- **Alternativas descartadas durante la implementación**: `bitnami/minio` como *service container* (evita el problema del comando porque su entrypoint no lo exige) — descartada al comprobar en la práctica que la imagen ya no está disponible en Docker Hub (Bitnami reestructuró qué imágenes quedan gratuitas en 2025). Fake en memoria de `BlobStore` para los tests — descartado como único mecanismo de test (aunque puede usarse en los tests de `handler.go`, que no necesitan ejercitar el SDK real): un fake no detecta problemas reales de configuración/protocolo con MinIO, mismo razonamiento que ya se aplicó a `internal/routes/` con Postgres real.

## Risks / Trade-offs

- [**Pérdida de `PHOTO_ENCRYPTION_KEY`** → ninguna foto ya subida es recuperable, para siempre] → Documentar explícitamente en el `.env.prod.example` y en la ADR nueva que esta clave no puede regenerarse ni rotarse sin perder acceso a las fotos ya cifradas con la anterior (mismo tipo de dependencia operativa ya aceptado con el dominio de Resend en ADR-038).
- [**Objetos huérfanos en MinIO si un borrado de foto falla a mitad** (se borra en Postgres pero falla el `Delete` en MinIO, o viceversa)] → Borrar primero en MinIO y solo si tiene éxito borrar la fila de Postgres: en el peor caso (fallo tras borrar en MinIO) queda una fila de metadatos apuntando a un objeto ya borrado, detectable y limpiable — el caso inverso (objeto huérfano en MinIO sin fila) sería silenciosamente invisible.
- [**Contenedor de `apps/api` no-root (hardening-despliegue-servidor) + `minio-go`**] → El cliente MinIO es puramente HTTP, sin necesidad de escribir en disco local — sin conflicto con el usuario `appuser` sin privilegios.

## Migration Plan

1. Migración `0006_create_route_photos.sql`.
2. Nuevo paquete `internal/photos/` (dominio, `BlobStore`, `PostgresPhotoStore`, `handler.go`) + wiring en `cmd/api/main.go`.
3. Nuevas variables en `config.Load()`: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `PHOTO_ENCRYPTION_KEY` (obligatorias, sin valor por defecto).
4. Servicio `minio` en CI (`ci.yml`) y en `docker-compose.yml` local.
5. Verificación real contra el servidor de producción (desde la rama sin fusionar, mismo patrón que ADR-034/038/039/041): crear un usuario/credenciales de MinIO dedicado para `apps/api` (no el root de MinIO), añadir `MINIO_ACCESS_KEY`/`SECRET_KEY`/`PHOTO_ENCRYPTION_KEY` a `.env.prod` del servidor, desplegar, verificar con `curl` real (subir, listar, descargar, borrar).
6. ADR nueva en `memory/decisions.md` documentando el cifrado y el primer uso real de MinIO.

## Open Questions

Ninguna — las decisiones pendientes (integración en `apps/mobile`, borrado en cascada al borrar ruta/cuenta) están fuera de alcance de este cambio, no de este backend en sí, y no afectan a los specs ni al enfoque elegido aquí.
