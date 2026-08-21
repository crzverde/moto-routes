## Why

En el listado de rutas, la tarjeta de una ruta exclusiva de la nube (cloud-only, nunca grabada en este dispositivo) siempre muestra el placeholder de "ruta vacía" en vez de una miniatura con el trazado GPS real, aunque esa ruta sí tenga puntos en el servidor y su detalle los pinte con normalidad. Causa: `ensurePreviewPolyline` (`route-list-polyline.service.ts`) calcula el trazado leyendo `route_points` del repositorio SQLite **local**; para una ruta cloud-only ese repositorio nunca tiene filas, y `route-list-thumb.ts` ya lo sabe — evita explícitamente disparar el backfill para `syncState === 'cloud-only'` ("no tiene puntos locales de los que calcular el trazado"). Detectado justo después de cerrar `fotos-rutas-cloud-only` (mismo hueco de fondo: una ruta cloud-only usando solo datos locales donde el backend ya tiene lo necesario), verificando visualmente el listado con una ruta real importada de producción.

## What Changes

- Cuando una tarjeta del listado es de una ruta cloud-only, la app calcula su miniatura descargando los puntos de esa ruta vía la API bajo demanda (mismo patrón perezoso — sin bloquear el render del listado — que ya usa el backfill de una ruta local), en vez de dejarla siempre en el placeholder.
- El resultado se guarda solo en memoria durante esa sesión de listado (no hay fila local en la que persistirlo, a diferencia de una ruta local) — se recalcula la próxima vez que se abra el listado, mismo coste que ya asume el detalle al descargar una ruta cloud-only cada vez que se abre.
- Un fallo al descargar los puntos (sin conexión, ruta borrada entretanto) deja la tarjeta en el placeholder sin bloquear el resto del listado — mismo criterio que ya sigue el backfill local si `getPointsByRouteId` fallara.

## Capabilities

### Modified Capabilities
- `route-cloud-sync`: el requisito "El listado combina rutas locales y de la nube sin duplicar" se amplía — una ruta exclusiva de la nube con puntos GPS reales ya no se queda indefinidamente con el placeholder de "sin datos".

## Impact

- **Frontend**: `apps/mobile/src/routes/list/route-list-polyline.service.ts` (función nueva, hermana de `ensurePreviewPolyline`, para el caso cloud-only), `apps/mobile/src/routes/list/route-list-thumb.ts` (`buildThumb`/`scheduleBackfill` dejan de excluir `syncState === 'cloud-only'` del backfill, ahora enrutan a la función nueva), `apps/mobile/src/routes/list/route-list.element.ts` (ya tiene `this._session`/`getApiBaseUrl()` disponibles en el punto donde llama a `buildThumb` — se le pasan también).
- **Backend**: sin cambios — reutiliza `GET /api/routes/{id}` (`fetchCloudRouteDetail`, ya usado por el detalle de una ruta cloud-only) para obtener los puntos.
- **Reutiliza** `simplifyPolyline` (`route-polyline.service.ts`, ya compartido entre cockpit y listado) sin cambios — acepta cualquier punto con `lat`/`lng`, compatible con el shape de un punto de la nube sin adaptar nada.
