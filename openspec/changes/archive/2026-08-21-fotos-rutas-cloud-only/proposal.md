## Why

El detalle de una ruta exclusiva de la nube (nunca grabada en este dispositivo) ya descarga y muestra sus puntos y paradas bajo demanda, pero no sus fotos: `loadCloudRouteData()` (`apps/mobile/src/routes/detail/route-detail.element.ts`) las deja siempre vacías, con un comentario explícito de que quedó fuera de alcance del cambio original `normalizar-y-exportar-rutas`/`route-cloud-sync`. El backend ya expone `GET /api/routes/{id}/photos` (metadatos) y `GET /api/routes/{id}/photos/{photoId}` (bytes descifrados) con la misma autenticación y comprobación de propiedad que el resto de endpoints de rutas — el hueco es solo de cliente. Detectado al usar una ruta con fotos, subida directamente a producción, como fixture de pruebas en Docker local: sus 3 fotos son descargables por API pero invisibles en la app.

## What Changes

- Cuando el detalle de una ruta se resuelve como exclusiva de la nube (`loadCloudRouteData`), la app pasa a listar sus fotos vía `GET /api/routes/{id}/photos` y a resolver cada imagen bajo demanda vía `GET /api/routes/{id}/photos/{photoId}`, mostrándolas en la misma galería/timeline que ya usan las rutas locales.
- Las fotos de una ruta cloud-only se muestran de solo lectura: sin botón de añadir foto ni de borrar (esta ruta no tiene repositorio local que respalde esas acciones) — el mismo criterio que ya aplica a "Subir a la nube", ausente en este tipo de ruta.
- Un fallo al descargar la lista o los bytes de una foto (sin conexión, foto borrada entretanto) se degrada sin bloquear el resto del detalle — mismo criterio que un fallo al abrir el detalle completo hoy.

## Capabilities

### Modified Capabilities
- `route-cloud-sync`: el requisito "Ver el detalle completo de una ruta que solo existe en la nube" se amplía — el detalle bajo demanda incluye ahora también las fotos, no solo mapa y timeline de puntos/paradas.

## Impact

- **Frontend**: `apps/mobile/src/routes/detail/route-detail.element.ts` (`loadCloudRouteData`), `apps/mobile/src/routes/detail/route-detail-cloud.service.ts` (nueva función de carga de fotos cloud-only), `apps/mobile/src/shared/http/photo-cloud-api.service.ts` (ya tiene `uploadRoutePhoto`/`deleteRoutePhoto` contra el mismo backend; se añade la función de listado+descarga que falta).
- **Backend**: sin cambios — `GET /api/routes/{id}/photos` y `GET /api/routes/{id}/photos/{photoId}` (`apps/api/internal/photos/handler.go`) ya existen y no requieren modificación.
- **UI**: la galería de fotos del detalle (`route-detail-photos-panel.js`) pasa a poder recibir fotos sin acciones de añadir/borrar cuando la ruta es cloud-only.
