## 1. `ensureCloudPreviewPolyline()`

- [x] 1.1 Test rojo en `route-list-polyline.service.spec.ts`: `ensureCloudPreviewPolyline(apiBaseUrl, session, route)` descarga los puntos de la ruta vía `fetchCloudRouteDetail` y devuelve el trazado simplificado (`simplifyPolyline`), igual que `ensurePreviewPolyline` pero sin persistir en ningún repositorio.
- [x] 1.2 Test rojo: si `route.previewPolyline` ya está calculado (no `null`), se devuelve tal cual sin llamar a `fetchCloudRouteDetail` (mismo guard que la función local).
- [x] 1.3 Test rojo: si la ruta no tiene ningún punto, devuelve `null` sin lanzar.
- [x] 1.4 Test rojo: si `fetchCloudRouteDetail` falla (red, 404), devuelve `null` sin lanzar — nunca rompe el listado.
- [x] 1.5 Implementar `ensureCloudPreviewPolyline()` en `route-list-polyline.service.ts` hasta verde.

## 2. Disparar el backfill cloud-only desde `route-list-thumb.ts`

- [x] 2.1 Test rojo (en `route-list.element.spec.ts`, vía DOM — `route-list-thumb.ts` no tiene spec propio, se ejercita a través del componente, mismo patrón ya usado en ese fichero): una tarjeta cloud-only con puntos GPS reales sustituye el placeholder por la silueta del trazado tras el backfill perezoso.
- [x] 2.2 Test rojo: una tarjeta cloud-only sin puntos GPS se queda con el placeholder, sin error.
- [x] 2.3 Test rojo: un fallo al descargar los puntos de una tarjeta cloud-only deja esa tarjeta en el placeholder sin afectar a las demás tarjetas del listado.
- [x] 2.4 Implementar: `buildThumb()`/`scheduleBackfill()` (`route-list-thumb.ts`) ganan `apiBaseUrl: string` y `session: Session | null`; para `syncState === 'cloud-only'` con `previewPolyline === null` y sesión activa, llaman a `ensureCloudPreviewPolyline()` en vez de omitir el backfill.
- [x] 2.5 Hilar `apiBaseUrl`/`session` desde `route-list.element.ts::buildThumbWithBadge()` hasta `buildThumb()`.

## 3. Verificación

- [x] 3.1 Cypress (`route-cloud-sync.cy.ts` o el spec de listado ya existente, según cuál tenga más sentido y sin superar `max-lines`): sembrar vía API una ruta cloud-only con puntos GPS reales, abrir el listado y comprobar que la tarjeta muestra el trazado (no el placeholder).
- [x] 3.2 Verificación manual en dispositivo Android real: abrir el listado con la ruta real ya usada como fixture ("Rutitas larga" en Docker local) y confirmar visualmente que su miniatura ya no es el placeholder de "ruta vacía".

## 4. Cierre

- [x] 4.1 Suite completa en verde: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run --coverage` (≥80%), Cypress contra backend real.
- [x] 4.2 Sincronizar la spec `route-cloud-sync` (delta de este cambio) a `openspec/specs/`.
- [x] 4.3 Actualizar `memory/context.md` (Estado Actual del Proyecto) con el resumen de la sesión.
