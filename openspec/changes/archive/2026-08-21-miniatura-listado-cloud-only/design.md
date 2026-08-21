## Context

`route-list-thumb.ts::buildThumb()` decide entre pintar la silueta SVG (si `route.previewPolyline` ya está calculado) o el placeholder, disparando en este último caso un backfill perezoso (`scheduleBackfill` → `ensurePreviewPolyline`, `route-list-polyline.service.ts`) que lee `route_points` del `IRouteRepository` **local** y persiste el resultado con `repository.updatePreviewPolyline()`. Para una ruta cloud-only (`syncState === 'cloud-only'`, sintetizada por `cloudSummaryToRoute()` en `route-list-sync.transform.ts` con `previewPolyline: null` fijo) ese repositorio nunca tiene filas, y el propio `buildThumb()` ya lo sabe: excluye explícitamente `cloud-only` del backfill. El backend ya expone los puntos completos de cualquier ruta de la cuenta vía `GET /api/routes/{id}` — la app ya lo consume desde el detalle (`fetchCloudRouteDetail`, `route-cloud-api.service.ts`) y, tras `fotos-rutas-cloud-only`, también para sus fotos. `simplifyPolyline` (`route-polyline.service.ts`) ya es agnóstica del origen del punto (`PolylinePoint { lat, lng }`).

Ver proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Que una tarjeta cloud-only con puntos GPS reales muestre su trazado real en el listado, no el placeholder indefinido.
- Reutilizar exactamente el mismo mecanismo perezoso/no bloqueante que ya usa el backfill local, sin introducir un patrón nuevo.

**Non-Goals:**
- Persistir el trazado calculado entre aperturas del listado — una ruta cloud-only no tiene fila local en la que guardarlo (a diferencia de `updatePreviewPolyline` para rutas locales); se recalcula cada vez que se abre el listado, mismo coste ya asumido por el detalle de una ruta cloud-only.
- Paginar, cachear entre pantallas o limitar por viewport las descargas de puntos — cada tarjeta cloud-only visible dispara su propia descarga bajo demanda, igual que ya hace el backfill local por cada tarjeta local sin trazado.
- Tocar el listado de fotos, notas o cualquier otro dato de la ruta — alcance exclusivo de la miniatura.

## Decisions

**Decisión 1 — Reutilizar `fetchCloudRouteDetail()` en vez de crear un endpoint o función de red nueva.** Ya descarga los puntos completos de una ruta de la cuenta (`GET /api/routes/{id}`, usado hoy por el detalle) — no hace falta un endpoint más ligero solo para la miniatura del listado. Alternativa descartada: pedir al backend un endpoint nuevo que devuelva un trazado ya simplificado — mayor alcance (cambio de backend) para un problema que ya se resuelve reutilizando lo que existe; se revisará solo si el volumen de datos por ruta resultara un problema real medido, no anticipado.

**Decisión 2 — Función nueva `ensureCloudPreviewPolyline(apiBaseUrl, session, route)` en `route-list-polyline.service.ts`, hermana de `ensurePreviewPolyline`, no una rama dentro de la misma.** Firma distinta (necesita `apiBaseUrl`/`session`, no `repository`) y sin el paso de persistencia (`updatePreviewPolyline`) que sí tiene la local — unificarlas en una sola función con parámetros opcionales sería más confuso que dos funciones pequeñas y explícitas. Nunca lanza: un fallo se resuelve como `null` (mismo contrato que la local cuando no hay puntos), dejando la tarjeta en el placeholder sin propagar el error.

**Decisión 3 — `route-list-thumb.ts` decide qué backfill disparar por `syncState`, sin bandera nueva.** `buildThumb()`/`scheduleBackfill()` ya reciben `item: RouteListItem` (con `syncState`) — al llegar a `cloud-only` con `previewPolyline === null`, en vez de no hacer nada (comportamiento actual), llaman a `ensureCloudPreviewPolyline()` si hay `session`; si no hay sesión, se queda en placeholder (no debería darse: sin sesión no hay concepto de ruta cloud-only en el listado, ver spec `route-cloud-sync`, "Sin sesión activa, el listado se comporta igual que hoy").
**Consecuencia de threading**: `buildThumb()`/`scheduleBackfill()` ganan dos parámetros nuevos (`apiBaseUrl: string`, `session: Session | null`), y `route-list.element.ts::buildThumbWithBadge()` se los pasa — ya tiene ambos disponibles en ese punto (`this._session`, `getApiBaseUrl()`), sin nuevo estado.

**Decisión 4 — El resultado se aplica in-place sobre el `Route` sintetizado (`route.previewPolyline = polyline`), igual que ya hace `scheduleBackfill` para el caso local.** Sin mecanismo de cache nuevo: mientras esa instancia de `<route-list>` viva (scroll, cambio de filtro/orden que no recrea la lista), la tarjeta ya no vuelve a pedir el backfill una vez resuelto una vez, porque el objeto `Route` en memoria ya tiene `previewPolyline` no-null.

## Risks / Trade-offs

- **[Riesgo] Un listado con muchas rutas cloud-only visibles a la vez dispara una descarga de puntos por cada una, en paralelo, sin límite de concurrencia.** → Mitigación: mismo perfil de coste que ya acepta el proyecto para el backfill local (una consulta por tarjeta sin trazado) y para el detalle de una ruta cloud-only (descarga completa al abrir); sin paginación en el listado hoy, así que el número de tarjetas simultáneas ya está acotado por lo que el listado carga de una vez. Si en la práctica resulta pesado, es un Non-Goal explícito de este cambio (ver arriba) — se revisaría en una sesión futura con datos reales, no anticipado aquí.
- **[shared] `route-polyline.service.ts` (compartido con `cockpit`) no se toca — solo se le pasan puntos de otro origen, mismo contrato `PolylinePoint`.**
