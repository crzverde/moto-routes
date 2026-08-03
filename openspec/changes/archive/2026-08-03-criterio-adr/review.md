# Review — `criterio-adr`

- **Fecha**: 2026-08-03
- **Veredicto**: **APPROVED WITH MINOR ISSUES**
- **Alcance revisado**: `openspec/config.yaml` (2 entradas), `memory/decisions.md` (ADR-034), `memory/context.md` (entrada de sesión). Sin código de aplicación.

## CRÍTICO — leer primero

- **Seguridad**: sin hallazgos. El cambio no introduce secretos, credenciales ni endpoints; no toca CSP, `connect-src`, `capabilities/default.json` ni ningún input de usuario. No hay código ejecutable nuevo de ninguna clase.
- **`src/shared/`**: no tocado. Radio de impacto sobre dominios: ninguno.
- **Dependencias core**: ninguna añadida, actualizada ni eliminada (npm, Cargo, Maven). `pnpm-lock.yaml` intacto.
- **Reglas del proyecto saltadas**: ninguna. `openspec/config.yaml` está bajo la regla de autorización explícita de `CLAUDE.md` y **el usuario dio el visto bueno expreso antes de crear el cambio**; ningún otro fichero de esa lista (`CLAUDE.md`, `.clinerules/`, `.claude/commands/`, `.claude/skills/`) fue modificado — verificado con `git status`.
- **Autogobierno**: este cambio reescribe la guía de `archive` que rige su propio archivado. Confirmado que `openspec instructions archive` ya sirve el texto nuevo, es decir el gate se ejecutó bajo la regla que el propio cambio introduce.

## Verificación independiente

Re-ejecutada por el revisor, sin aceptar la salida de la fase `apply`.

| # | Comprobación | Método | Resultado |
|---|---|---|---|
| 1 | YAML válido y estructura íntegra | `yaml.safe_load` de HEAD vs working tree, comparando claves y nº de entradas | Top-level, `rules.*` y `operations.*` idénticos en claves y conteos. `context:` byte a byte igual |
| 2 | Solo cambian las 2 entradas declaradas | Diff entrada a entrada | Exactamente `rules.design[0]` y `operations.archive.guidance[7]`. Ninguna otra |
| 3 | `openspec doctor` | Ejecución real | `OpenSpec root: ok`, sin errores |
| 4 | `openspec validate --all` | Ejecución real | 7 passed, 0 failed |
| 5 | **El criterio se inyecta de verdad** | `openspec instructions <art> --json` sobre los 4 artefactos | Presente **solo** en `design` (4 reglas). Ausente en `proposal` (5), `tasks` (5) y `specs` (5) |
| 6 | Entradas 2-4 de `rules.design` sin dañar | Comparación con la línea base capturada en 1.1 | Idénticas |
| 7 | Inmutabilidad del log de ADRs | `git diff --numstat` + diff del fichero truncado antes de ADR-034 | 13 adiciones / **0 borrados**. Las 21 ADRs previas byte a byte iguales (la única diferencia es la línea en blanco separadora) |
| 8 | ADR-034 con el formato del fichero | Extracción de campos y comparación con ADR-033 | Los 6 campos, mismo orden: Fecha, Estado, Contexto, Decisión, Alternativas consideradas, Consecuencias |
| 9 | Referencias de línea de los artefactos | `git show HEAD:openspec/config.yaml` | `rules.design` 90-94 ✔ y `archive.guidance` 205-206 ✔ — correctas en HEAD |
| 10 | Consumidor aguas abajo (docs) | `pnpm docs:prepare` real | Copia OK, ADR-034 llega a `docs/reference/adr.md`. `docs/reference/` está gitignored (`.gitignore:37`), no amplía el alcance |
| 11 | Alcance | `git status --porcelain` | Solo `memory/context.md`, `memory/decisions.md`, `openspec/config.yaml` y el directorio del cambio. Nada en `apps/`, `infra/`, `.github/`, `.husky/` |

**Suite de aplicación no ejecutada, y es correcto**: el cambio no toca TypeScript, Rust, Java ni componentes, así que Vitest/tsc/ESLint/Clippy/cargo/Cypress no tienen nada que cubrir aquí. Comprobado además que **ningún `*.spec.ts` del repo lee `openspec/config.yaml` ni `memory/decisions.md`**, por lo que no existe test previo que este cambio pudiera romper.

## Cobertura de escenarios

**No aplica**: el cambio declara `skip_specs: true` (sin comportamiento observable nuevo) y no tiene delta specs — `artifactPaths.specs.existingOutputPaths` está vacío. En su lugar se mapean las 12 tareas contra su evidencia.

| Grupo | Tareas | Evidencia |
|---|---|---|
| 1. Criterio en `rules.design` | 1.1–1.3 | Comprobaciones 1, 2, 3, 4, 6 |
| 2. `archive` verifica | 2.1–2.2 | Comprobación 2; guía nueva servida por `instructions archive` |
| 3. Inyección real | 3.1–3.2 | Comprobación 5, en las dos direcciones |
| 4. ADR-034 | 4.1–4.3 | Comprobaciones 7, 8 |
| 5. Cierre | 5.1–5.2 | Comprobaciones 10, 11 |

12/12 tareas con verificación ejecutada, ninguna dada por buena solo por revisión visual.

## Hallazgos

### ISSUE-001 — `rules.tasks` es ahora load-bearing y no está señalado como tal
- **Categoría**: calidad (acoplamiento implícito)
- **Severidad**: menor, no bloqueante
- **Dónde**: `openspec/config.yaml` → `rules.tasks`, última entrada
- **Descripción**: la nueva `archive.guidance` dice que la ADR «se escribe en `design.md` durante propose». Pero `design.md` es un artefacto de planificación que se archiva con el cambio: para que la ADR aterrice de verdad en `memory/decisions.md` hace falta una tarea en `tasks.md`, y lo único que la exige es `rules.tasks` («cerrar con una tarea de actualización de … `memory/decisions.md`»). Esa entrada pasa de ser una conveniencia a ser el único puente entre la decisión y el fichero. Si alguien la recorta más adelante creyendo que `archive` ya se encarga, las ADRs dejarían de aterrizar sin que nada lo señale.
- **Estado**: consciente y documentado. La fase `apply` releyó esa entrada (tarea 2.2), la juzgó no contradictoria y la dejó intacta por estar fuera de las dos ediciones declaradas en `proposal.md` — criterio correcto, se prefiere no ampliar alcance en silencio. Anotado en `memory/context.md`.
- **Acción recomendada**: no bloquea. Candidato a un cambio propio que haga explícito el puente en la propia entrada de `rules.tasks`.

### ISSUE-002 — énfasis markdown en un fichero que no usa esa convención
- **Categoría**: convenciones
- **Severidad**: cosmética, no bloqueante
- **Dónde**: `openspec/config.yaml` → `rules.design`, primera entrada (`**Merece ADR**` / `**No merece ADR**`)
- **Descripción**: es la única entrada del fichero con énfasis markdown. El resto de `config.yaml` marca énfasis en mayúsculas (p. ej. «Está CONGELADO» en el bloque `context:`). Se mantuvo así por fidelidad literal al texto aprobado en `design.md` § Decisión 3, en vez de normalizarlo por cuenta propia.
- **Impacto real**: ninguno funcional — el texto se inyecta como cadena en un prompt, donde el énfasis markdown es si acaso útil para el modelo que lo lee. Verificado que la CLI lo sirve íntegro (comprobación 5).
- **Acción recomendada**: ninguna obligatoria. Si se prefiere homogeneidad, cambiar a mayúsculas en un ajuste posterior.

### Sin hallazgos en

- **Gap** (escenario sin implementar): ninguno. No hay escenarios; las 12 tareas están completas y verificadas.
- **Desviación** (implementado distinto a lo especificado): ninguna. Las dos ediciones coinciden con las Decisiones 2 y 3 de `design.md`; los Non-Goals se respetaron (nada retroactivo, sin gate técnico, `docs/05` y `rules.proposal` sin tocar).
- **Cobertura** (escenario sin test): la ausencia de test automatizado es un **Non-Goal declarado y argumentado** (`design.md` § Decisión 5), no un descuido: un test sobre prosa destinada a reformularse penalizaría mejorarla y encaja en lo que `rules.proposal` llama «inventar un requisito para pasar la validación».
- **Convenciones de frontend**: no aplica, sin ficheros de frontend.

## Nota sobre la guía nueva de `archive`

Aplicando la guía que este mismo cambio introduce: **no se añade ADR nueva en el archivado**. La decisión quedó registrada durante `propose` (`design.md`) y aterrizó en `memory/decisions.md` como ADR-034 durante `apply` (tarea 4.1). Durante la implementación no surgió ninguna decisión nueva de calado: los dos juicios que se tomaron —no tocar `rules.tasks` (tarea 2.2) y recortar ADR-034 (tarea 4.2)— son aplicaciones del criterio ya decidido, no decisiones nuevas, y ambos están anotados en `memory/context.md`.

Merece constancia que el recorte de la tarea 4.2 fue un caso real del criterio funcionando: el primer borrador de ADR-034 salió con 4.097 caracteres arrastrando una nota de deuda conocida — que es «estado» y la lista negativa del propio criterio manda a `memory/context.md`. Corregido en la misma fase, quedó en 3.872 caracteres, cero marcadores de narrativa de sesión (`sha256sum`, `ss -tlnp`, `adb`, `curl`).

## Veredicto

**APPROVED WITH MINOR ISSUES.** Las 12 tareas están completas con verificación real y reproducible. Las dos ediciones a `openspec/config.yaml` son exactamente las declaradas, sin daño estructural, y el efecto pretendido —que el criterio se inyecte en `design` y solo en `design`— está comprobado empíricamente en las dos direcciones. La inmutabilidad del log de ADRs se sostiene con evidencia (`0` borrados). Los dos issues son no bloqueantes: ISSUE-001 es un acoplamiento a vigilar, ya anotado en la memoria del proyecto; ISSUE-002 es cosmético y sin impacto funcional.
