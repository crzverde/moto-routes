# Tasks — almacenamiento-fotos-backend

## 1. Migración y dominio base

- [ ] 1.1 Migración `apps/api/internal/migrate/migrations/0006_create_route_photos.sql` (tabla `route_photos`, ver design.md D4)
- [ ] 1.2 `internal/photos/photos.go` — tipos de dominio (`Photo`), constantes `MaxPhotosPerRoute = 100`, `MaxPhotoSizeBytes = 15 * 1024 * 1024`, errores (`ErrTooManyPhotos`, `ErrPhotoTooLarge`, `ErrRouteOwnedByAnotherUser`, `ErrPhotoNotFound`)

## 2. Cifrado de aplicación

- [ ] 2.1 Test en rojo: cifrar y descifrar un payload de prueba con la misma clave devuelve el original; con una clave distinta, falla la autenticación (no descifra basura silenciosamente)
- [ ] 2.2 `internal/photos/encryption.go` — `Encrypt(key, plaintext) ([]byte, error)` / `Decrypt(key, ciphertext) ([]byte, error)` con AES-256-GCM (`crypto/aes`+`crypto/cipher`), nonce de 12 bytes antepuesto al ciphertext
- [ ] 2.3 Test: una clave que no decodifica a exactamente 32 bytes en base64 se rechaza explícitamente, no se trunca ni rellena en silencio

## 3. `BlobStore` sobre MinIO

- [ ] 3.1 `internal/photos/blob_store.go` — interfaz `BlobStore` (`Put`/`Get`/`Delete`) + `MinioBlobStore` con `github.com/minio/minio-go/v7`
- [ ] 3.2 `go get github.com/minio/minio-go/v7` — añadir a `go.mod`/`go.sum`
- [ ] 3.3 Test de integración contra un MinIO real (`internal/photos/blob_store_test.go`): `Put` seguido de `Get` devuelve los mismos bytes; `Delete` seguido de `Get` devuelve "no encontrado"

## 4. Metadatos en Postgres

- [ ] 4.1 Test en rojo (`postgres_photo_store_test.go`, contra Postgres real vía `dbtest.Connect`): crear una foto para una ruta, listarla, borrarla
- [ ] 4.2 `internal/photos/postgres_photo_store.go` — `PostgresPhotoStore` (`Create`, `ListByRoute`, `GetByIDForRoute`, `Delete`), guard de propiedad resuelto contra `routes.user_id` (join o subconsulta, nunca un `user_id` propio en `route_photos`)
- [ ] 4.3 Test: `Create` sobre una ruta de otra cuenta se rechaza (`ErrRouteOwnedByAnotherUser`), sin crear ninguna fila

## 5. Handlers HTTP

- [ ] 5.1 Test en rojo (`handler_test.go`, fake `BlobStore`+`PhotoStore`+`RequireAuth` real): `POST /api/routes/{id}/photos` con `multipart/form-data` sube correctamente
- [ ] 5.2 `internal/photos/handler.go` — `UploadHandler` (multipart, `http.MaxBytesReader` antes de leer, valida tamaño y límite de 100/ruta, cifra antes de `BlobStore.Put`)
- [ ] 5.3 Test: subir a una ruta de otra cuenta → error sin filtrar si existe; subir un fichero que supera 15MB → rechazado sin llegar a `BlobStore.Put`; subir a una ruta ya con 100 fotos → rechazado
- [ ] 5.4 Test en rojo: `GET /api/routes/{id}/photos` devuelve metadatos sin bytes, lista vacía si no hay fotos, rechazado si la ruta es de otra cuenta
- [ ] 5.5 `ListHandler`
- [ ] 5.6 Test en rojo: `GET /api/routes/{id}/photos/{photoId}` devuelve los bytes descifrados con el `Content-Type` correcto; 404 si el id no existe; rechazado si la ruta es de otra cuenta
- [ ] 5.7 `DownloadHandler` (descifra tras `BlobStore.Get`, escribe directamente en el `ResponseWriter`)
- [ ] 5.8 Test en rojo: `DELETE /api/routes/{id}/photos/{photoId}` borra de MinIO y de Postgres; rechazado si la ruta es de otra cuenta, sin borrar nada
- [ ] 5.9 `DeleteHandler` (borra primero en `BlobStore`, solo si tiene éxito borra la fila — ver design.md Risks)

## 6. Configuración y wiring

- [ ] 6.1 `internal/config/config.go` — `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` obligatorias; `PHOTO_ENCRYPTION_KEY` obligatoria, decodificada de base64 y validada a 32 bytes exactos en el arranque
- [ ] 6.2 `cmd/api/main.go` — cuatro rutas nuevas bajo `/api/routes/{id}/photos` tras `RequireAuth`+CORS+`OPTIONS`, wiring de `MinioBlobStore`+`PostgresPhotoStore`

## 7. Infraestructura de test (CI + local)

- [ ] 7.1 `.github/workflows/ci.yml` — servicio `minio` nuevo en el job `quality-go` (mismo patrón que el `postgres` ya existente), variables de entorno de test inyectadas en el step de `go test`
- [ ] 7.2 `infra/docker/docker-compose.yml` — servicio `minio` nuevo para desarrollo local, variables correspondientes en `api`
- [ ] 7.3 Verificar que la suite completa (`go test ./...`) pasa en local contra el MinIO de `docker-compose.yml`

## 8. Despliegue real y verificación (mismo patrón que ADR-034/038/039/041)

- [x] 8.1 Crear en el servidor un usuario/credenciales de MinIO dedicado para `apps/api` (no el root de MinIO) — `mc admin user add`/policy de solo el bucket `images`. Política `apps-api-photos` (`s3:GetObject/PutObject/DeleteObject/ListBucket` acotados a `arn:aws:s3:::images` y `images/*`), usuario `apps-api-<hex>` con esa política adjunta. Credenciales generadas y escritas directamente en `.env.prod` del servidor por un script remoto — nunca visibles en la salida de este agente.
- [x] 8.2 Generar `PHOTO_ENCRYPTION_KEY` real (32 bytes aleatorios, base64) y añadir junto a las credenciales de MinIO a `.env.prod` del servidor — nunca versionado. `.env.prod` verificado en `600 gonzalo:gonzalo` tras el cambio.
- [x] 8.3 Desplegar desde esta rama sin fusionar (checkout manual en el servidor, `docker compose up -d --build`) — el script `deploy-prod.sh` sigue apuntando a `master`, que todavía no incluye este cambio. Imagen anterior etiquetada `docker-api:pre-almacenamiento-fotos` para rollback.
- [x] 8.4 Verificar con `curl` real contra producción: subir una foto de prueba a una ruta de una cuenta de prueba, listarla, descargarla y comprobar que los bytes coinciden con el original, borrarla. **Hallazgo real**: la primera petición `DELETE` a través de Tailscale Funnel devolvió un 404 genérico de chi justo después del redeploy — transitorio, confirmado reproduciendo la misma petición directamente contra `100.114.190.36:8080` (401 correcto) y repitiendo por Funnel poco después (funcionó, 204) — no es un bug de enrutado, probablemente Funnel con una conexión en vuelo hacia el contenedor recién reiniciado. Segunda ronda completa (registro→login→ruta→subida→borrado→verificación) sin ningún fallo. Cuenta y ruta de prueba borradas después, `count(*) = 0` en `users`/`routes`/`route_photos`.
- [x] 8.5 Verificar que los bytes almacenados en MinIO (`mc cat` directo, con las credenciales acotadas de `apps/api`, sin pasar por la API) no son una imagen válida — confirmado: 97 bytes (69 originales + 12 nonce + 16 tag GCM), sin cabecera PNG (`89 50 4E 47`), mismo resultado que en la verificación local previa
- [x] 8.6 Borrar la cuenta y ruta de prueba usadas en la verificación — hecho en ambas rondas de verificación (8.4), `count(*) = 0` confirmado en `users`/`routes`/`route_photos`

## 9. Cierre

- [x] 9.1 `go vet` + `go test ./...` sin regresiones — 150/150 en verde
- [x] 9.2 `infra/docker/.env.prod.example` — documentado nombres de variables nuevas (nunca valores reales)
- [x] 9.3 Revisar el diff completo buscando secretos reales antes del PR (gate de seguridad) — sin hallazgos; único match (`MINIO_ROOT_PASSWORD` en `ci.yml`) es una credencial trivial de test efímero en el runner, mismo patrón ya aceptado para `POSTGRES_PASSWORD` en el mismo fichero
- [x] 9.4 Actualizar `memory/context.md` con el estado del cambio y los hallazgos (ADR-042 ya añadida en el propio `/opsx:propose`)

**Nota**: sin tarea de verificación en dispositivo Android real — este cambio es exclusivamente backend, `apps/mobile` no se toca (ver proposal.md, Fuera de alcance).
