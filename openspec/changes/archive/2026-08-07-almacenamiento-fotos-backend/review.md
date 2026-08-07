# Review — `almacenamiento-fotos-backend`

## CRÍTICO (leer primero)

- **Cambio de seguridad real: cifrado en reposo + credenciales dedicadas.** Verificado que la clave (`PHOTO_ENCRYPTION_KEY`) nunca vive junto a los datos que cifra: en producción, MinIO tiene un usuario dedicado (`apps-api-<hex>`) con una política (`apps-api-photos`) acotada solo a `s3:GetObject/PutObject/DeleteObject/ListBucket` sobre el bucket `images` — nunca las credenciales root de MinIO. Confirmado con `mc admin policy create`/`mc admin user add`/`mc admin policy attach` reales en el servidor, no solo documentado.
- **Sin criptografía hecha a mano**: `crypto/aes`+`crypto/cipher` (librería estándar de Go, modo GCM con autenticación) — ninguna implementación propia de cifrado. Nonce de 12 bytes vía `crypto/rand` por foto, nunca reutilizado con la misma clave (verificado con `TestEncrypt_SameKeyProducesDifferentCiphertextEachTime`).
- **Sin secretos reales en el diff**: revisado el diff completo de la rama contra `master` buscando el string exacto de cualquier secreto. Único hallazgo: `MINIO_ROOT_PASSWORD=motoroutes123` en `.github/workflows/ci.yml` — credencial trivial de un contenedor MinIO efímero del propio runner de CI, mismo patrón ya aceptado desde hace tiempo para `POSTGRES_PASSWORD: motoroutes` en el mismo fichero. Las credenciales reales de producción (usuario MinIO dedicado, `PHOTO_ENCRYPTION_KEY`) se generaron y escribieron directamente en `.env.prod` del servidor por un script remoto — nunca aparecieron en la salida de quien implementó este cambio, ni en ningún commit.
- **Ninguna foto se sirve por URL directa ni presigned de MinIO** (Decisión D3 de `design.md`): confirmado leyendo `DownloadHandler` — siempre descarga de MinIO, descifra, y escribe los bytes en la respuesta HTTP de la propia API.
- **Gap real de cobertura encontrado y corregido durante esta revisión**: el escenario "Sin token de sesión no hay acceso a ninguna foto" del spec exige explícitamente los cuatro casos (subir/listar/descargar/borrar), pero solo `UploadHandler` tenía un test `WithoutToken`. Añadidos los tres tests que faltaban (`TestListHandler_WithoutTokenReturns401`, `TestDownloadHandler_WithoutTokenReturns401`, `TestDeleteHandler_WithoutTokenReturns401`) antes de cerrar esta revisión — los cuatro handlers ya estaban protegidos en el código real (`auth.RequireAuth` en `cmd/api/main.go`), así que no era un bug de producción, solo un gap de test.
- **Sin cambios en `src/shared/` ni en `apps/mobile`**: el cambio es exclusivamente backend (`apps/api`), infraestructura de test (`ci.yml`, `docker-compose.yml`) y documentación. Los dos `// TODO` de `route-detail.element.ts` quedan intactos, fuera de alcance explícito de este cambio (ver `proposal.md`).

## Cobertura Requirement → Scenario → Test

| Requirement | Scenario | Test(s) | Estado |
|---|---|---|---|
| Subir una foto a una ruta propia | Subida correcta | `TestUploadHandler_SuccessEncryptsAndStores`; verificado real con `curl` en local y producción (bytes idénticos tras cifrar/descifrar) | ✅ |
| | No se puede subir a ruta de otra cuenta | `TestUploadHandler_OnAnotherUsersRouteReturns404WithoutStoringInBlob`, `TestPostgresPhotoStore_CreateOnAnotherUsersRouteFails` | ✅ |
| | No se puede subir a ruta inexistente | `TestPostgresPhotoStore_CreateOnNonExistentRouteFails` (mismo camino de código que "otra cuenta" — `checkRouteOwnership` no distingue los dos casos, por diseño) | ✅ |
| | Foto que supera el tamaño máximo se rechaza | `TestUploadHandler_TooLargePhotoRejectedWithoutReachingBlobStore` | ✅ |
| | Ruta con máximo de fotos rechaza subidas | `TestUploadHandler_TooManyPhotosReturns400`, `TestPostgresPhotoStore_CreateRejectsWhenRouteAlreadyHasMaxPhotos` | ✅ |
| Listar las fotos de una ruta propia | Listado correcto | `TestListHandler_ReturnsMetadataWithoutBytes`; verificado real con `curl` | ✅ |
| | Ruta sin fotos devuelve lista vacía | `TestListHandler_EmptyWhenNoPhotos`, `TestPostgresPhotoStore_ListByRouteIsEmptyWhenNoPhotos` | ✅ |
| | No se puede listar de otra cuenta | `TestListHandler_OnAnotherUsersRouteReturns404`, `TestPostgresPhotoStore_ListByRouteOfAnotherUserFails`; verificado real en producción (segunda cuenta → 404) | ✅ |
| Descargar una foto de una ruta propia | Descarga correcta | `TestDownloadHandler_ReturnsDecryptedBytes`; verificado real (bytes idénticos al original, `Content-Type` correcto, local y producción) | ✅ |
| | No se puede descargar de otra cuenta | `TestDownloadHandler_OnAnotherUsersRouteReturns404`; verificado real en producción | ✅ |
| | Descargar id inexistente | `TestDownloadHandler_UnknownPhotoIDReturns404`, `TestPostgresPhotoStore_GetByIDReturnsNotFoundForUnknownPhoto` | ✅ |
| Borrar una foto de una ruta propia | Borrado correcto | `TestDeleteHandler_DeletesFromBlobStoreThenMetadata`, `TestPostgresPhotoStore_DeleteRemovesPhotoFromListing`; verificado real con `curl` en local y producción, incluida la baja del objeto en MinIO | ✅ |
| | No se puede borrar de otra cuenta | `TestDeleteHandler_OnAnotherUsersRouteReturns404WithoutDeletingAnything`, `TestPostgresPhotoStore_DeleteOnAnotherUsersRouteFailsWithoutDeleting`; verificado real en producción | ✅ |
| Las fotos se almacenan cifradas en reposo | Los bytes almacenados no son la imagen original | `TestEncryptDecrypt_RoundTripReturnsOriginalPlaintext`, `TestUploadHandler_SuccessEncryptsAndStores` (comprueba que lo almacenado ≠ plaintext); **verificado real** con `mc cat` directo (credenciales acotadas de `apps/api`, sin pasar por la API) en local y producción: 97 bytes, sin cabecera PNG válida | ✅ |
| Ninguna foto accesible sin autenticación ni sin ser propietario | Sin token no hay acceso en los cuatro casos | `TestUploadHandler_WithoutTokenReturns401`, `TestListHandler_WithoutTokenReturns401`, `TestDownloadHandler_WithoutTokenReturns401`, `TestDeleteHandler_WithoutTokenReturns401` — los tres últimos añadidos durante esta revisión (ver CRÍTICO) | ✅ |

**15/15 escenarios cubiertos por test** (unitarios + integración real contra Postgres/MinIO), más verificación manual end-to-end contra producción real documentada en `tasks.md` grupo 8.

## Hallazgos

### Gap (corregido durante la revisión, ver CRÍTICO)
- Cobertura de "sin token" incompleta para 3 de 4 endpoints — corregido, no queda deuda.

### Calidad
- `checkRouteOwnership` unifica "ruta no existe" y "ruta de otra cuenta" en el mismo `ErrRouteOwnedByAnotherUser` — decisión correcta y coherente con el resto del proyecto (`routes.DetailHandler` ya hace lo mismo), no una carencia.
- El script de despliegue (`scripts/deploy-prod.sh`, de `hardening-despliegue-servidor`) sigue sin poder usarse literalmente para este cambio por la misma razón ya documentada entonces (pull de `master`, que todavía no incluye la rama) — desviación ya aceptada como patrón del proyecto (ADR-034/038/039/041), no un problema nuevo.

### Cobertura
- Sin gaps restantes tras el fix de esta revisión.

### Convenciones de proyecto
- Sin desviaciones — `apps/mobile` no se toca, sin CSS ni componentes nuevos, `internal/photos/` sigue el mismo patrón de fichero por responsabilidad que `internal/routes/`.

## Veredicto

**APPROVED**

Los 6 requisitos y sus 15 escenarios están cubiertos por test, con verificación real (no solo simulada) tanto en local como en producción: cifrado en reposo confirmado inspeccionando bytes crudos con credenciales acotadas, aislamiento entre cuentas confirmado con una segunda cuenta real, y las cuatro operaciones CRUD verificadas de punta a punta con `curl` contra el servidor real. El único gap encontrado (cobertura de "sin token" incompleta) se corrigió en el momento, dentro de esta misma revisión. Sin hallazgos de seguridad pendientes.
