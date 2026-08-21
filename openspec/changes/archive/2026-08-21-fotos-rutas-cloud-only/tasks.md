## 1. Cliente de fotos en la nube: listar y descargar

- [x] 1.1 Test rojo en `photo-cloud-api.service.spec.ts`: `listRoutePhotos(apiBaseUrl, token, routeId)` contra `GET /api/routes/{id}/photos` devuelve los metadatos tipados (mismo shape que ya usa el backend: id, mimeType, latitude, longitude, capturedAt), y mapea 401/404/network igual que `uploadRoutePhoto`/`deleteRoutePhoto` (reusar `toPhotoCloudApiError`).
- [x] 1.2 Implementar `listRoutePhotos()` en `photo-cloud-api.service.ts` hasta verde.
- [x] 1.3 Test rojo: `downloadRoutePhoto(apiBaseUrl, token, routeId, photoId)` contra `GET /api/routes/{id}/photos/{photoId}` devuelve un `Blob` con el `Content-Type` de la respuesta.
- [x] 1.4 Implementar `downloadRoutePhoto()` hasta verde (no usa `fetchJson`, la respuesta es binaria — mismo criterio que `exportRouteGPX`).

## 2. Orquestación: `loadCloudRoutePhotos()`

- [x] 2.1 Test rojo en `route-detail-cloud.service.spec.ts`: `loadCloudRoutePhotos(apiBaseUrl, session, routeId)` lista las fotos y descarga sus bytes en paralelo, devolviendo `PhotoWithUrl[]` con `objectUrl` construido vía `URL.createObjectURL()` sobre cada blob.
- [x] 2.2 Test rojo: una ruta sin fotos devuelve `[]` sin error.
- [x] 2.3 Test rojo: un fallo en el listado o en la descarga de alguna foto se resuelve como resultado degradado (fotos vacías + flag/mensaje de error), nunca lanza — mismo patrón que `loadCloudRouteDetail`.
- [x] 2.4 Implementar `loadCloudRoutePhotos()` hasta verde, incluyendo el `filePath` sintético inerte (`cloud:${photoId}`) y `remotePhotoId` con el id real del backend (ver design.md, Decisión 2).

## 3. Integración en `route-detail.element.ts`

- [x] 3.1 Test rojo en `route-detail.element.spec.ts`: al abrir el detalle de una ruta cloud-only con fotos, `loadCloudRouteData()` llama a `loadCloudRoutePhotos()` en paralelo con `loadCloudRouteDetail()` (no secuencial) y puebla `this._photos`.
- [x] 3.2 Test rojo: si la descarga de fotos falla pero el detalle (puntos/paradas) tiene éxito, el mapa y el timeline se muestran igualmente y aparece el aviso discreto (`showToast`, mismo patrón que `autoResyncIfNeeded`).
- [x] 3.3 Implementar la llamada paralela y el manejo del resultado degradado hasta verde.
- [x] 3.4 Confirmar que `revokePhotoUrls()` limpia también las `objectUrl` de fotos cloud-only al salir del detalle (mismo mecanismo ya existente, sin lista paralela — ver design.md, Risks).

## 4. Solo lectura: sin añadir ni borrar en cloud-only

- [x] 4.1 Test rojo en `route-detail-photos-panel.spec.ts`: `buildPhotosSection()` acepta un nuevo parámetro (p. ej. `readOnly: boolean`) que, a `true`, omite el elemento `<photo-capture>` de la sección.
- [x] 4.2 Implementar el parámetro hasta verde, invocado desde `route-detail.element.ts` con `readOnly = !this._isLocalRoute`.
- [x] 4.3 Test rojo: al abrir el visor de fotos (`openPhotoViewer`) desde una ruta cloud-only, no se pasa `onDelete` (o se pasa `undefined`), de forma que el visor no muestra acción de borrar.
- [x] 4.4 Implementar el gateo de `onDelete` por `this._isLocalRoute` hasta verde.

## 5. E2E y verificación real

- [x] 5.1 Cypress (`route-cloud-sync.cy.ts` o spec nuevo si el existente ya roza `max-lines`): sembrar vía API una ruta con 2-3 fotos en una cuenta, abrirla como cloud-only (sin repositorio local) y comprobar que la galería muestra las fotos reales y no aparece el botón de captura.
- [x] 5.2 Cypress: sembrar una ruta cloud-only sin fotos y comprobar que el detalle se muestra con normalidad, sin sección de fotos vacía ni error visible.
- [x] 5.3 Verificación manual en dispositivo Android real (`75fe536b` u otro disponible): abrir una ruta cloud-only con fotos reales y confirmar visualmente que cargan en la galería y en el visor a pantalla completa, sin acciones de añadir/borrar.

## 6. Cierre

- [x] 6.1 Suite completa en verde: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run --coverage` (≥80%), Cypress contra backend real.
- [x] 6.2 Sincronizar la spec `route-cloud-sync` (delta de este cambio) a `openspec/specs/`.
- [x] 6.3 Actualizar `memory/context.md` (Estado Actual del Proyecto) con el resumen de la sesión.
