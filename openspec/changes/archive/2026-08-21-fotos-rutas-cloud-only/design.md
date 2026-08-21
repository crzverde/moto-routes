## Context

`loadCloudRouteData()` (`apps/mobile/src/routes/detail/route-detail.element.ts:189`) ya descarga puntos y paradas de una ruta cloud-only vía `loadCloudRouteDetail()` (`route-detail-cloud.service.ts`), pero fija `this._photos = []` explícitamente y no vuelve a tocarlas. El componente ya sabe pintar una galería de fotos (`this._photos: PhotoWithUrl[]`, `PhotoWithUrl extends Photo { objectUrl: string }`) para rutas locales, resolviendo cada `objectUrl` con `getPhotoUrl(p.filePath)` (Tauri `convertFileSrc` sobre un fichero en disco). El backend ya expone lo necesario sin cambios: `GET /api/routes/{id}/photos` (lista de metadatos, sin bytes) y `GET /api/routes/{id}/photos/{photoId}` (bytes ya descifrados, `Content-Type` correcto) — ver `apps/api/internal/photos/handler.go`, `ListHandler`/`DownloadHandler`.

Ver proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Que una ruta cloud-only muestre sus fotos reales en la misma galería/timeline que una ruta local, sin duplicar componentes de UI.
- Que un fallo de red al listar o descargar fotos no rompa ni vacíe el resto del detalle (mapa/timeline), que ya carga con éxito de forma independiente.

**Non-Goals:**
- Añadir o borrar fotos en una ruta cloud-only (no hay repositorio local que respalde esas acciones — permanece de solo lectura, igual que "Subir a la nube" ya está ausente para este tipo de ruta).
- Cachear o persistir localmente las fotos descargadas de una ruta cloud-only entre sesiones de la app — se descargan bajo demanda cada vez que se abre el detalle, igual que ya hacen puntos y paradas.
- Cambiar el comportamiento de fotos para rutas locales o sincronizadas (`loadLocalRouteData`, ajeno a este cambio).

## Decisions

**Decisión 1 — Nueva función `loadCloudRoutePhotos()` en `route-detail-cloud.service.ts`, en vez de extender `loadCloudRouteDetail()`.** Mantiene la separación ya existente entre "detalle" (puntos/paradas, siempre necesario) y "fotos" (opcional, puede fallar independientemente) — permite que un fallo de fotos no contamine el resultado ya tipado `CloudRouteLoaded | CloudRouteLoadFailed` del detalle. La función nueva: `GET /api/routes/{id}/photos` para la lista, luego `GET /api/routes/{id}/photos/{photoId}` en paralelo (`Promise.all`) para los bytes de cada una, construyendo un `Blob` por respuesta y su `URL.createObjectURL()`. Nunca lanza — un fallo se resuelve como lista vacía con un flag de error para el aviso discreto (mismo patrón que `checkIfRouteIsSynced`).

**Decisión 2 — Reutilizar `PhotoWithUrl` en vez de crear un tipo nuevo `CloudPhoto`.** `PhotoWithUrl extends Photo` exige `filePath: string`, pensado para `getPhotoUrl(filePath)` vía Tauri (ver Context). Para una foto cloud-only no existe fichero local, así que `filePath` se rellena con un valor sintético inerte (`` `cloud:${photoId}` ``) que nunca se lee — grep confirma que `filePath` en `PhotoWithUrl` solo se dereferencia en las dos líneas de `route-detail.element.ts` que llaman a `getPhotoUrl()`, ambas exclusivas del flujo de ruta local (`loadLocalRouteData`/subida de foto nueva); el flujo cloud-only construye su `objectUrl` directamente desde el blob descargado, sin pasar por `getPhotoUrl`. Alternativa descartada: introducir un tipo `CloudPhoto` separado y una unión discriminada en `this._photos` — más correcto en teoría, pero obliga a tocar `route-detail-photos-panel.js`, `route-map-photos.ts` y el visor de fotos a pantalla completa para aceptar el tipo unión, un radio de cambio mucho mayor para un caso que ya cabe en el tipo existente sin ambigüedad real (el propio componente nunca distingue local/cloud por `filePath`, solo por `_isLocalRoute` a nivel de ruta). `remotePhotoId` se rellena con el id real devuelto por el backend (coincide semánticamente: "id de esta foto en el backend de fotos").

**Decisión 3 — Sin botones de añadir/borrar: gatear por `this._isLocalRoute`, no por un flag nuevo.** El componente ya distingue ruta local vs. cloud-only con `_isLocalRoute` (usado hoy para "Subir a la nube"). La sección de fotos reutiliza la misma bandera para ocultar los controles de añadir/borrar — ninguna bandera nueva de estado.

**Decisión 4 — Descarga de fotos en paralelo con puntos/paradas, no secuencial.** `loadCloudRouteData()` lanza `loadCloudRouteDetail()` y `loadCloudRoutePhotos()` a la vez (`Promise.all` a nivel del propio método), no fotos-después-de-detalle. Evita que una ruta con muchas fotos grandes retrase la aparición del mapa/timeline, que hoy son inmediatos.

## Risks / Trade-offs

- **[Riesgo] Descargar todas las fotos de golpe (sin miniaturas ni lazy-load) puede ser lento/pesado en una ruta con muchas fotos grandes sobre una conexión móvil real.** → Mitigación: ya es un límite conocido y aceptado por el backend (`MaxPhotoSizeBytes`, tope de fotos por ruta — ver `route-cloud-sync`, "Los límites del backend de fotos se respetan al subir"); no se introduce paginación ni miniaturas en este cambio (Non-Goal), pero el aviso discreto de la Decisión 1 cubre el caso de fallo a mitad de descarga.
- **[Riesgo] `URL.createObjectURL()` sobre blobs descargados debe revocarse al salir del detalle, igual que ya hace `revokePhotoUrls()` para fotos locales.** → Mitigación: las URLs de fotos cloud-only se añaden al mismo mecanismo de revocado ya existente (`revokePhotoUrls()`), sin lista de limpieza paralela.
- **[shared] No se toca `src/shared/` — `PhotoWithUrl` vive en `route-detail.types.ts` (dominio `routes/detail`, no shared) y `photo-cloud-api.service.ts` ya es el punto de extensión correcto para las dos funciones GET nuevas.**
