## Context

Ver `proposal.md` — Why. Lo relevante para el diseño es cómo la CLI entrega estas reglas:

`rules:` está indexado **por artefacto**, no por comando. `openspec instructions <artefacto> --change <n> --json` devuelve `rules.<artefacto>` y solo eso. Verificado en esta sesión: `openspec instructions design --change criterio-adr --json` devuelve las 4 entradas de `rules.design` y ninguna de `rules.proposal`.

Consecuencia directa: no existe un punto de inyección «al proponer» en general. Existe uno por artefacto. Como `/opsx:propose` genera `proposal.md` y `design.md` en la misma pasada, el momento de propose se alcanza a través de `rules.design` — que además ya es la única regla del fichero que dice *crear* la ADR (`config.yaml:90-94`).

Estado actual de las cuatro menciones a `memory/decisions.md` en `openspec/config.yaml`:

| Clave | Línea | Qué dice hoy | Momento |
|---|---|---|---|
| `rules.proposal` | 63-65 | Revisar el log; si el cambio contradice una ADR, decirlo en el Why | Solo lee |
| `rules.design` | 90-94 | «Si el cambio introduce una decisión nueva de ese calado, crear la ADR» | Crea, en propose |
| `rules.tasks` | 118-120 | Cerrar con una tarea de actualización de `decisions.md` «si procede» | Crea, al final |
| `operations.archive.guidance` | 205-206 | «añadir la ADR … si el cambio tomó alguna decisión de arquitectura nueva» | Crea, al archivar |

Ninguna define el umbral. Las dos últimas empujan la redacción al cierre del cambio.

## Goals / Non-Goals

**Goals:**

- Que el criterio se inyecte automáticamente en el momento en que se decide si hay ADR, sin depender de que alguien recuerde consultarlo.
- Concentrar la redacción de la ADR en `propose`, cuando las alternativas siguen vivas y las consecuencias son predicciones y no evidencias.
- Dejar el criterio corto: es texto que entra en un prompt en cada `/opsx:propose`, compite por contexto con las otras 3 reglas de `rules.design`.

**Non-Goals:**

- No se toca ninguna ADR aceptada, ni su contenido, ni su orden, ni el hueco 001-012. Ver Decisión 4.
- No se añade gate técnico (test, hook, validación de CLI) que verifique el cumplimiento del criterio. Ver Riesgos.
- No se reescribe `docs/05-memory-system.md` §2, que hoy documenta el formato con ejemplos inventados. Deuda anotada, cambio aparte.
- No se toca `rules.proposal:63-65`: leer el log antes de proponer es correcto tal cual está.

## Decisions

### 1. El criterio va en `rules.design`, no en `rules.proposal`

`rules.proposal` se inyecta solo al escribir `proposal.md`, artefacto que responde al *por qué* del cambio y que explícitamente delega el *cómo* a `design.md`. La decisión de si algo merece una ADR es una decisión de diseño y su registro natural es `design.md`, que ya enlaza la ADR por regla existente.

**Alternativas descartadas:** (a) `rules.proposal` — se inyecta antes de que existan las decisiones técnicas que podrían merecer ADR; el criterio llegaría demasiado pronto. (b) Duplicarlo en varias claves — dos fuentes del mismo criterio es exactamente el problema que causó la migración de [[ADR-027]] (el criterio de revisión sobreviviendo solo para Claude). (c) Una clave nueva de nivel superior — el esquema `spec-driven` no la leería; solo `rules.<artefacto>` y `operations.<op>.guidance` se inyectan.

### 2. `archive` verifica, no redacta

`operations.archive.guidance` pasa de mandar añadir la ADR a mandar comprobar que la decisión ya quedó registrada en `propose`, y añadir una nueva solo si surgió de verdad durante `apply` — caso real y frecuente en este proyecto (los tres gaps de GitHub Actions de [[ADR-031]], el `OUT_DIR` cacheado de [[ADR-032]], el `pg_hba.conf` de [[ADR-033]] aparecieron todos implementando, no proponiendo).

La redacción se mueve, no desaparece. Lo que cambia es el default: hoy el default es «escríbela al archivar», y por eso el log tiene informes; el nuevo default es «ya debería existir, verifica».

**Alternativa descartada:** dejar `archive` como está y añadir solo el criterio en `design`. Se descarta porque no ataca la causa de la inflación — seguirían existiendo dos momentos válidos de redacción y el último ganaría por ser el que tiene la evidencia delante.

### 3. Forma del criterio

Texto propuesto para `rules.design` (sustituye a la entrada actual de 3 líneas, no se añade una quinta regla):

> Las decisiones duraderas viven en `memory/decisions.md` como ADR numerada; en `design.md` se registra la decisión y se enlaza la ADR, nunca se duplica su contenido. **Merece ADR** lo que cumpla al menos uno: revertirlo dentro de un año obligaría a tocar varios módulos, migrar datos o rehacer el flujo de trabajo; se evaluaron alternativas reales y se descartaron; o se descubrió algo contraintuitivo que el código no muestra y que alguien razonable desharía al "limpiar". **No merece ADR** el estilo o la nomenclatura (eso es config del linter), el detalle de cómo se implementó algo (eso es el código y sus tests), el estado o la narrativa de la sesión (eso es `memory/context.md` y `review.md`), ni una decisión sin alternativa real. Una ADR = una decisión, redactada aquí y no al archivar, en una pantalla: contexto, decisión, alternativas descartadas y consecuencias. Las ADRs aceptadas no se editan — se superseden con una nueva.

Tres disparadores en vez de uno porque los tres aparecen en el log real y ninguno cubre a los otros dos: el coste de reversión explica ADR-013/032, las alternativas evaluadas explican ADR-025/028, y el hallazgo contraintuitivo explica ADR-020/021/023 — que son las de mayor valor de todo el log y las que un criterio basado solo en "arquitectura" habría dejado fuera.

La lista negativa es tan importante como la positiva: es lo único que separa la ADR de `memory/context.md`, y su ausencia es lo que dejó a ADR-033 cargando con `sha256sum` y salida de `ss -tlnp`.

**Alternativa descartada:** un único criterio de "significancia arquitectónica" al estilo Nygard. Se descarta porque el log real ya contiene decisiones de proceso ([[ADR-029]], [[ADR-030]]) e infraestructura ([[ADR-031]]) que ese criterio excluiría, y que se quieren mantener. De ahí "duraderas" en vez de "de arquitectura".

### 4. Inmutabilidad: nada retroactivo

Ninguna ADR existente se edita, reordena ni resume. La propiedad que da valor al log es poder leer qué se creía en julio y qué cambió después; editarlo deja una foto del estado actual, que ya da el código. El criterio rige de ADR-035 en adelante. El desorden (026 antes de 024) y el arranque en 013 quedan como hechos históricos.

Se recoge en la ADR-034, no aquí: ver `memory/decisions.md` una vez creada.

### 5. Sin test estructural

No se añade un `*.spec.ts` que verifique la presencia del criterio en el YAML, pese al precedente de `apps/mobile/src/shared/ci/ci-workflow.spec.ts` y `pre-commit-audit-gate.spec.ts`. Aquellos afirman sobre estructura ejecutable (jobs, pasos, comandos) cuyo significado no cambia al reescribir una frase. Este afirmaría sobre prosa destinada a reformularse, rompería en cada matiz y presionaría hacia no mejorar el texto. Es el caso que `rules.proposal` describe como "inventar un requisito para pasar la validación".

## Risks / Trade-offs

- **El criterio se inyecta pero no se puede forzar** → Mismo nivel de enforcement elegido conscientemente en [[ADR-029]] (rama+PR) y [[ADR-030]] (tablero): disciplina documentada, sin gate técnico. Mitigación real: al vivir en `rules.design`, se inyecta en **cada** `/opsx:propose` sin que nadie tenga que acordarse — que es más de lo que tienen rama y PR hoy.
- **Mover la redacción a `propose` puede producir ADRs que el `apply` desmienta** → Es el comportamiento correcto: si `apply` invalida una decisión propuesta, eso es una decisión nueva y `archive` la recoge (Decisión 2). El precedente existe y está documentado: las Consecuencias de [[ADR-027]] anunciaban que los agentes se *realinearían* y el `apply` acabó eliminándolos, y esa desviación se anotó en la propia ADR en vez de reescribir la historia.
- **`rules.design` crece de 4 a 4 entradas pero la primera se alarga bastante** → Coste de contexto en cada `propose`. Se acepta: es la regla que más decisiones dirige, y se ha redactado para caber en un párrafo en vez de en una lista larga.
- **`openspec/config.yaml` está bajo autorización explícita de `CLAUDE.md`** → El usuario dio el visto bueno en esta sesión antes de crear el cambio. No se toca ningún otro fichero de esa lista (`CLAUDE.md`, `.clinerules/`, `.claude/commands/`, `.claude/skills/`).
- **Sin impacto Android/WebView ni en `src/shared/`** → El cambio no toca código de aplicación; no hay radio de impacto sobre dominios, ni consideraciones de CSP, permisos o segundo plano.

## Migration Plan

Sin migración ni rollback especial: dos ediciones de texto en `openspec/config.yaml` y una sección nueva al final de `memory/decisions.md`. Revertir es `git revert` del commit. No hay estado persistido, ni build, ni despliegue afectado.

Verificación de que la inyección funciona de verdad, no solo de que el fichero cambió: tras editar, ejecutar `openspec instructions design --change criterio-adr --json` y confirmar que el criterio aparece en el array `rules` devuelto — mismo método con el que `migrar-sdd-a-openspec` comprobó que `config.yaml` se inyectaba de verdad.
