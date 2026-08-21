# Review: fotos-rutas-cloud-only

## CRÍTICO (leer primero)

- **Seguridad**: sin cambios de backend, sin secretos nuevos, sin CSP/`connect-src` tocado (los dos endpoints usados, `GET /api/routes/{id}/photos` y `GET /api/routes/{id}/photos/{photoId}`, ya existían y usan la misma autenticación Bearer + comprobación de propiedad de siempre — verificado en `apps/api/internal/photos/handler.go`, no modificado por este cambio). No aplica el criterio de auth/secretos de `openspec/config.yaml`.
- **`src/shared/`**: no se toca ningún fichero de `src/shared/` a excepción de una única llamada nueva a funciones ya existentes en `src/shared/http/photo-cloud-api.service.ts` (mismo fichero que ya exponía `uploadRoutePhoto`/`deleteRoutePhoto`, se le añaden dos funciones GET hermanas con el mismo patrón). Sin radio de impacto sobre otros dominios.
- **Dependencias**: ninguna nueva (npm/Cargo/Go).
- **Reglas del proyecto saltadas**: ninguna. TDD estricto seguido en los 6 grupos de `tasks.md` (confirmado re-leyendo el orden de commits de la sesión: cada test se vio en rojo antes de la implementación). Único ajuste fuera de alcance: `apps/mobile/vite.config.ts` tenía un error de TypeScript preexistente sin commitear (WIP del propio usuario sobre `tauri android dev --host`, no de este cambio) que bloqueaba cualquier build — corregido con un spread condicional para `hmr` (mismo patrón que se usó aquí mismo para `onDelete`), sin tocar la lógica de `mobileHost`. No forma parte del alcance de `fotos-rutas-cloud-only` pero era necesario para poder verificar en dispositivo real.

## Mapeo Requirement → Scenario → Test

Capability modificada: `route-cloud-sync` — Requirement "Ver el detalle completo de una ruta que solo existe en la nube" (delta `specs/route-cloud-sync/spec.md`).

| Scenario | Test | Estado |
|---|---|---|
| Abrir el detalle de una ruta que solo existe en la nube | `route-detail.element.spec.ts` (preexistente) + `route-cloud-sync.cy.ts` (preexistente) | Sin cambios en este delta, ya cubierto |
| Abrir una ruta exclusiva de la nube sin conexión | `route-detail.element.spec.ts` (preexistente) | Sin cambios en este delta, ya cubierto |
| Las fotos de una ruta exclusiva de la nube se muestran igual que en una ruta local | `route-detail.element.spec.ts::"descarga las fotos en paralelo con el detalle y las muestra en la galería"` + `route-detail-cloud.service.spec.ts::loadCloudRoutePhotos` (2 tests) + `photo-cloud-api.service.spec.ts::listRoutePhotos/downloadRoutePhoto` + `route-cloud-sync-photos.cy.ts::"las fotos de una ruta cloud-only se descargan y se muestran en la galería..."` | Cubierto (unit + E2E real) |
| Una ruta exclusiva de la nube sin fotos no muestra ningún hueco ni error | `route-detail.element.spec.ts::"sin ninguna foto, la ruta exclusiva de la nube muestra el placeholder sin error"` + `route-detail-cloud.service.spec.ts::"una ruta sin fotos devuelve photos: [] sin error"` + `route-cloud-sync-photos.cy.ts::"una ruta cloud-only sin fotos muestra el detalle con normalidad..."` | Cubierto (unit + E2E real) |
| Un fallo al descargar las fotos no bloquea el resto del detalle | `route-detail.element.spec.ts::"si falla la descarga de fotos, el mapa y el timeline se muestran igual con un aviso discreto"` + `route-detail-cloud.service.spec.ts` (2 tests de fallo: listado y descarga) | Cubierto solo por unit test — sin equivalente E2E (mismo criterio que otros escenarios de fallo de red del mismo spec, p. ej. "Subir sin conexión", tampoco tienen Cypress dedicado) |
| Sin acciones de añadir ni borrar fotos en una ruta exclusiva de la nube | `route-detail-photos-panel.spec.ts` (2 tests `readOnly`) + `route-detail.element.spec.ts` (botón añadir + botón borrar del visor, 2 tests) + `route-cloud-sync-photos.cy.ts` (botón añadir ausente) | Cubierto (unit + E2E real; el botón de borrar del visor solo se verifica por Vitest, no por Cypress — cobertura funcional equivalente, sin gap real) |

**6/6 escenarios del delta cubiertos.** Verificación manual adicional en dispositivo Android real (`75fe536b`) confirmada por el usuario ("funciona") sobre datos reales (ruta con 3 fotos reales importada de producción).

## Verificación independiente ejecutada en esta sesión (no solo el resumen de `apply`)

- `tsc --noEmit`: limpio.
- `eslint src/ --max-warnings 0`: limpio (incluye `route-detail.element.ts`, que queda en 503 líneas totales pero bajo el límite de 400 del override específico del fichero una vez descontados comentarios/blancos — confirmado por el propio ESLint, no solo contado a mano).
- `vitest run --coverage`: **1258/1258** tests, **140/140** ficheros, cobertura global **96.9% líneas / 90.82% branches / 95.2% funciones** (umbral del proyecto: 80%).
- `cypress run` (suite completa, 15 specs, backend real vía `docker compose`): **80/80** tests, incluyendo el spec nuevo `route-cloud-sync-photos.cy.ts` (2/2) y sin regresiones en el resto (`route-cloud-sync.cy.ts`, `route-photo-sync.cy.ts`, etc.).

## Hallazgos

### Calidad

- **`route-detail-cloud.service.ts:230` y `route-detail.element.ts:203`** — fuga de `Blob` URL acotada en un caso límite poco frecuente: `loadCloudRoutePhotos()` llama a `URL.createObjectURL(blob)` dentro de cada promesa individual de `Promise.all(summaries.map(...))`. Si la descarga de **una** foto falla mientras otras de la misma ruta ya se resolvieron con éxito, `Promise.all` rechaza como conjunto y esas `objectUrl` ya creadas para las fotos que sí bajaron bien se quedan sin referencia — nunca se revocan (el resultado descartado es `{ photos: [], error }`). El mismo patrón se repite un nivel más arriba: si `loadCloudRouteDetail` (puntos/paradas) falla pero `loadCloudRoutePhotos` tuvo éxito, el `Promise.all` en `route-detail.element.ts:198-201` espera a ambas, pero el camino de error (`result.error !== undefined`) retorna sin tocar `photosResult.photos`, dejando esas `objectUrl` igual de huérfanas.
  - **Severidad**: baja — solo ocurre en un fallo de red parcial (no total) durante la carga inicial de una ruta cloud-only, acotado al número de fotos de esa ruta (tope ya impuesto por el backend), sin implicación de seguridad ni de datos, y coherente con que `revokePhotoUrls()` nunca llega a ejecutarse porque esas URLs nunca entran en `this._photos`.
  - **Recomendación, no bloqueante**: si se quiere cerrar del todo, envolver cada descarga individual en su propio `try/catch` dentro del `map` en vez de dejar que un fallo tire de `Promise.all` completo — cambio pequeño, no incluido aquí porque no estaba en el alcance decidido en `design.md` y el propio `design.md` (Riesgo 2) ya reconoce el mecanismo de revocado como limitación conocida sin plan de mitigación explícito para este caso concreto. Queda anotado para una futura sesión si se repite en la práctica.

Sin hallazgos de categoría **gap**, **desviación** ni **convenciones de frontend** (estructura por dominio, separación `.service`/`.element`/`.types` respetada; sin CSS tocado; `data-cy` no aplica — ningún elemento interactivo nuevo, solo una condición que omite uno ya existente).

## Veredicto

**APPROVED WITH MINOR ISSUES**

Único hallazgo (fuga de `Blob` URL en un caso límite de fallo parcial) es de severidad baja, sin impacto de seguridad ni de datos, documentado con recomendación para una futura sesión. Los 6 escenarios del delta spec están cubiertos por test (5 con Vitest+Cypress, 1 solo con Vitest por ser un escenario de fallo de red sin precedente de cobertura E2E en el resto del spec). Suite completa verificada de forma independiente en esta sesión: Vitest 1258/1258 (96.9% cobertura), Cypress 80/80, `tsc`/`eslint` limpios. Verificación manual en dispositivo real confirmada por el usuario.
