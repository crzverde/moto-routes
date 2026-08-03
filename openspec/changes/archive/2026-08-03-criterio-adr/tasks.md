## 1. Criterio en `rules.design`

- [x] 1.1 Capturar el estado previo como línea base: ejecutar `openspec instructions design --change criterio-adr --json` y guardar el array `rules` devuelto, para poder comparar después de editar. Sin esto no hay forma de demostrar que el cambio se inyecta de verdad y no solo que el fichero cambió.
- [x] 1.2 Sustituir la primera entrada de `rules.design` en `openspec/config.yaml` (líneas 90-94) por el texto de la Decisión 3 de `design.md`. Se sustituye, no se añade una quinta regla — la entrada actual queda absorbida entera dentro de la nueva.
- [x] 1.3 Verificar que `openspec/config.yaml` sigue siendo YAML válido y que la CLI lo lee: `openspec doctor` sin errores y `openspec validate --all` limpio.

## 2. `archive` verifica en vez de redactar

- [x] 2.1 Reformular la última guía de `operations.archive.guidance` (líneas 205-206) según la Decisión 2 de `design.md`: verificar que la decisión quedó registrada en `propose`, y añadir ADR nueva solo si surgió durante `apply`. Mantener intacta la parte de actualizar `memory/context.md`, que no está en discusión.
- [x] 2.2 Releer las otras dos menciones a `memory/decisions.md` del fichero (`rules.proposal:63-65` y `rules.tasks:118-120`) y confirmar que siguen siendo coherentes con el nuevo reparto: `proposal` solo lee, `tasks` cierra con la actualización de memoria. Si alguna contradice el nuevo default, corregirla en esta misma tarea; si no, dejarla intacta y anotarlo.

## 3. Verificación real de la inyección

- [x] 3.1 Ejecutar de nuevo `openspec instructions design --change criterio-adr --json` y confirmar que el criterio aparece literalmente en el array `rules`, comparándolo con la línea base de 1.1. Es el gate real de este cambio: si el texto no se inyecta, el cambio no sirve para nada aunque el fichero esté editado.
- [x] 3.2 Ejecutar `openspec instructions proposal --change criterio-adr --json` y confirmar que el criterio **no** aparece ahí — comprueba que la inyección es por artefacto, que es la premisa sobre la que se eligió `rules.design` frente a `rules.proposal` (Decisión 1).

## 4. ADR-034

- [x] 4.1 Añadir ADR-034 al final de `memory/decisions.md` con el formato del fichero (`Fecha`/`Estado`/`Contexto`/`Decisión`/`Alternativas consideradas`/`Consecuencias`), recogiendo las Decisiones 1, 2, 4 y 5 de `design.md` y sus alternativas descartadas. Estado `Aceptada`, fecha 2026-08-03.
- [x] 4.2 Escribirla cumpliendo su propio criterio: una pantalla, sin narrativa de sesión, sin duplicar el texto de la regla (se enlaza `openspec/config.yaml`, no se copia). Si la ADR-034 no pasa su propio filtro, el criterio está mal redactado y hay que volver a 1.2.
- [x] 4.3 Verificar que no se ha modificado ninguna ADR anterior: `git diff memory/decisions.md` debe mostrar únicamente adiciones al final del fichero, ninguna línea borrada ni movida.

## 5. Cierre

- [x] 5.1 Actualizar `memory/context.md` con el estado resultante de este cambio, incluyendo la deuda que se deja anotada y no se ataca: `docs/05-memory-system.md` §2 documenta el formato de ADR con ejemplos inventados (`ADR-001: Usar PostgreSQL`, `ADR-002: Estrategia de branching`) que no existen en el log real.
- [x] 5.2 Confirmar que no se ha tocado ningún fichero fuera del alcance declarado en `proposal.md` — solo `openspec/config.yaml` y `memory/decisions.md`, más los artefactos del propio cambio. `git status` como evidencia.
