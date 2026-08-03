## Why

`openspec/config.yaml` manda crear ADRs en tres sitios distintos (`rules.design:90-94`, `rules.tasks:118-120`, `operations.archive.guidance:205-206`) pero **ninguno define qué merece una ADR y qué no**. La única pista es la expresión «una decisión nueva de ese calado», que no se explica en ninguna parte. El resultado es un log de 21 ADRs sin criterio común: conviven decisiones de stack (ADR-013), de proceso (ADR-029, ADR-030), de infraestructura (ADR-031 a ADR-033) y de diseño interno de una feature (ADR-024, ADR-025, ADR-026), sin que exista una regla que diga si todas ellas debían estarlo.

Además, dos de esos tres puntos (`rules.tasks` y `archive.guidance`) empujan la redacción de la ADR **al final del cambio**, cuando lo que hay en la mano es evidencia de verificación y no una decisión pendiente. Ese es el origen medible de la inflación del log: las seis primeras ADRs promedian ~800 caracteres; ADR-031 a ADR-033 rondan los 4.400 y ADR-027 llega a 12.872, con contenido que es narrativa de sesión (`sha256sum`, salida de `ss -tlnp`, una contraseña regenerada dos veces) y que `memory/context.md` ya recoge en paralelo. Una ADR escrita al archivar deja de ser un registro de decisión y pasa a ser un informe.

Esto importa más aquí que en un proyecto normal porque `memory/decisions.md` no es documentación de estantería: `rules.proposal:63-65` obliga a leerlo antes de proponer, así que es entrada real del flujo automatizado y la memoria que un agente sin contexto previo no tiene de otra forma.

No contradice ninguna ADR aceptada. Se apoya en [[ADR-027]] (`openspec/config.yaml` como source of truth de la metodología) y sigue el mismo criterio de enforcement que [[ADR-029]] y [[ADR-030]]: disciplina documentada e inyectada, sin gate técnico nuevo.

## What Changes

- **`openspec/config.yaml` → `rules.design`**: se amplía la regla existente con el criterio explícito de qué merece una ADR (coste de reversión, existencia de alternativas reales, hallazgo contraintuitivo que el código no muestra) y qué no (estilo, detalle de implementación, estado o progreso, decisión sin alternativas). Se inyecta al escribir `design.md`, es decir durante `/opsx:propose` — con las alternativas todavía vivas.
- **`openspec/config.yaml` → `operations.archive.guidance`**: la última guía pasa de «añadir la ADR» a **verificar** que la decisión quedó registrada durante `propose`, y añadir una nueva solo si surgió realmente durante `apply`. Deja de ser el punto de redacción por defecto.
- **`memory/decisions.md` → ADR-034 nueva**: registra la decisión, sus alternativas descartadas (entre ellas mantener la redacción en `archive`, y colocar el criterio en `rules.proposal` o solo en `docs/`) y sus consecuencias. Sin ella, el criterio existiría sin registro de por qué es ese y no otro — justo el fallo que la práctica de ADR existe para evitar.
- **Alcance deliberadamente excluido**: no se edita ninguna ADR ya aceptada (ADR-013 a ADR-033 quedan intactas, incluida su numeración desordenada y el arranque en 013). La inmutabilidad es la propiedad que hace que el log valga algo; el criterio aplica de ADR-035 en adelante. `docs/05-memory-system.md` §2 tiene ejemplos inventados (`ADR-001: Usar PostgreSQL`) que no existen en el log real: es deuda conocida, se anota pero no se ataca aquí.

## Capabilities

### New Capabilities

Ninguna. El cambio no altera comportamiento observable de la aplicación: toca la configuración de la metodología (`openspec/config.yaml`) y la memoria del proyecto (`memory/decisions.md`). `.openspec.yaml` declara `skip_specs: true`, mismo criterio que ya se aplicó en `migrar-sdd-a-openspec` (tooling y documentación).

### Modified Capabilities

Ninguna. Las seis capabilities existentes en `openspec/specs/` (`api-backend`, `ci-cd`, `local-dev-environment`, `monorepo-layout`, `security-audit`, `server-deployment`) describen comportamiento de la aplicación y la infraestructura, y ninguna cambia.

## Impact

- `openspec/config.yaml` — dos ediciones: `rules.design` (línea 90-94, se amplía) y `operations.archive.guidance` (línea 205-206, se reformula). Fichero bajo la regla de autorización explícita de `CLAUDE.md`; el usuario ya dio el visto bueno a tocarlo en esta sesión.
- `memory/decisions.md` — se añade ADR-034 al final, sin tocar las 21 anteriores.
- **Sin impacto en código de aplicación**: ni `apps/mobile/`, ni `apps/api/`, ni `infra/`. Sin dependencias npm, Cargo ni Maven nuevas. Sin cambios en `.husky/pre-commit` ni en `.github/workflows/ci.yml`.
- **Sin test automatizado nuevo**: el criterio es prosa que la CLI inyecta en el prompt, no comportamiento ejecutable. Un test estructural tipo `ci-workflow.spec.ts` solo podría afirmar que ciertas palabras siguen en el YAML, lo que sería frágil ante cualquier reformulación y aportaría poco — se descarta explícitamente en vez de inventar cobertura.
- **Riesgo principal**: el criterio se inyecta pero no se puede forzar; su cumplimiento depende de quien redacta, igual que rama+PR en [[ADR-029]]. Se asume de forma consciente y se documenta en las consecuencias de la ADR-034.
