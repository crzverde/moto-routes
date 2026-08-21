# Review: miniatura-listado-cloud-only

## CRÍTICO (leer primero)

- **Seguridad**: sin cambios de backend, sin secretos nuevos. Reutiliza `fetchCloudRouteDetail()` (`GET /api/routes/{id}`), endpoint ya existente y ya autenticado (Bearer + comprobación de propiedad), sin modificarlo.
- **`src/shared/`**: no se toca ningún fichero de `src/shared/` — solo consume `fetchCloudRouteDetail` (ya exportado) desde el dominio `routes/list`. Sin radio de impacto sobre otros dominios.
- **Dependencias**: ninguna nueva.
- **Reglas del proyecto saltadas**: ninguna. TDD estricto seguido en los 4 grupos de `tasks.md` (rojo confirmado con `vitest run` antes de cada implementación, no solo revisado visualmente).

## Mapeo Requirement → Scenario → Test

Capability modificada: `route-cloud-sync` — Requirement "El listado combina rutas locales y de la nube sin duplicar" (delta `specs/route-cloud-sync/spec.md`).

| Scenario | Test | Estado |
|---|---|---|
| Ruta solo local / Ruta local ya sincronizada / Ruta que solo existe en la nube / Sin sesión activa / Con sesión pero sin conexión | Preexistentes, sin cambios en este delta | Ya cubiertos, sin regresión (suite completa re-ejecutada) |
| La miniatura de una ruta exclusiva de la nube muestra su trazado real | `route-list-polyline.service.spec.ts::ensureCloudPreviewPolyline` (2 tests) + `route-list.element.spec.ts::"la miniatura de una ruta exclusiva de la nube con puntos GPS sustituye el placeholder por el trazado real"` + `route-list.cy.ts::"sustituye el placeholder por el trazado real de una ruta cloud-only con puntos GPS"` | Cubierto (unit + E2E real) |
| Una ruta exclusiva de la nube sin puntos GPS se queda con el placeholder | `route-list-polyline.service.spec.ts::"devuelve null...cuando la ruta no tiene ningún punto"` + `route-list.element.spec.ts::"una ruta exclusiva de la nube sin puntos GPS se queda con el placeholder, sin error"` | Cubierto solo por unit test — sin Cypress dedicado (mismo criterio aceptado en `fotos-rutas-cloud-only`: el caso "sin datos" es la ausencia de una llamada real, no aporta más que el unit test) |
| Un fallo al descargar los puntos de una ruta cloud-only deja la tarjeta en el placeholder | `route-list-polyline.service.spec.ts::"devuelve null...cuando fetchCloudRouteDetail falla"` + `route-list.element.spec.ts::"un fallo al descargar los puntos...deja esa tarjeta en el placeholder sin afectar al resto del listado"` | Cubierto solo por unit test — mismo criterio que el resto de escenarios de fallo de red de este spec (ninguno tiene Cypress dedicado en todo `route-cloud-sync`) |

**3/3 escenarios nuevos cubiertos**, 5/5 preexistentes sin regresión. Verificación manual adicional en dispositivo Android real (`75fe536b`) confirmada por el usuario ("funciona, lo estoy viendo") sobre la misma ruta real ("Rutitas larga") ya usada como fixture en `fotos-rutas-cloud-only`.

## Verificación independiente ejecutada en esta sesión

- `tsc --noEmit`: limpio.
- `eslint src/ --max-warnings 0`: limpio.
- `vitest run --coverage`: **1244/1244** tests, **140/140** ficheros, cobertura global **96.9% líneas / 90.79% branches / 95.18% funciones** (umbral: 80%).
- `cypress run` (suite completa, 14 specs, backend real): **79/79** tests, sin regresiones, incluyendo el test nuevo en `route-list.cy.ts` (no en `route-cloud-sync.cy.ts`, que ya rozaba `max-lines` — decisión ya anticipada en `tasks.md` 3.1).

## Hallazgos

Sin hallazgos de ninguna categoría (gap, desviación, calidad, cobertura, convenciones de frontend). A diferencia del cambio anterior (`fotos-rutas-cloud-only`), aquí no hay recursos que revocar (`ensureCloudPreviewPolyline` devuelve tuplas `[number, number]`, no `Blob`/`ObjectURL`) — el patrón de fuga encontrado en aquel cambio no aplica a este.

El riesgo de concurrencia sin límite (una descarga por tarjeta cloud-only visible, en paralelo) ya está documentado y aceptado explícitamente en `design.md` (Non-Goal + Risk), con el mismo perfil de coste que el resto de descargas bajo demanda ya aceptadas en `route-cloud-sync` — no se repite aquí como hallazgo nuevo.

## Veredicto

**APPROVED**

Los 3 escenarios nuevos del delta spec están cubiertos por test (2 con Vitest+Cypress, 2 solo con Vitest por ser escenarios de fallo/ausencia de datos, mismo criterio ya usado en el resto de este spec). Suite completa verificada de forma independiente en esta sesión: Vitest 1244/1244 (96.9% cobertura), Cypress 79/79, `tsc`/`eslint` limpios. Verificación manual en dispositivo real confirmada por el usuario. Sin hallazgos de seguridad, `src/shared/`, dependencias ni convenciones.
