## Why

El `README.md` de la raíz sigue describiendo el proyecto como una única app Tauri en la raíz del repositorio (stack, scripts, estructura de carpetas). Desde la sesión `entorno-api-docker` (2026-08-03, ver ADR-032) el repositorio es un monorepo: la app móvil se trasladó a `apps/mobile/` y se añadió `apps/api/` (backend HTTP, migrado de Java/Spring Boot a Go en `migrar-api-golang`, ver ADR-034) más `infra/docker/` para orquestación local. Cualquiera que siga el `README.md` hoy (`npm install`, `npm run dev`, rutas de `src/`) se encuentra con comandos y rutas que ya no existen en la raíz. No hay cambio de comportamiento del sistema: es documentación desalineada con el código y con `openspec/specs/monorepo-layout/spec.md`, que ya describe la estructura real.

## What Changes

- Reescribir `README.md` para reflejar el monorepo: `apps/mobile/` (frontend TS+Vite+Tauri+Rust) y `apps/api/` (backend Go+chi+pgx+PostgreSQL), más `infra/docker/` para el entorno local.
- Actualizar la tabla de stack tecnológico: añadir Go 1.25, chi, pgx/v5, golang-jwt, bcrypt, PostgreSQL 16, Docker Compose; mantener lo ya vigente de la app móvil.
- Actualizar scripts disponibles: los comandos de `npm run *` documentados hoy se ejecutan realmente desde `apps/mobile` (pnpm es el gestor real del workspace), y añadir cómo levantar `apps/api` (Docker Compose / `go run`).
- Actualizar "Estructura del Proyecto" para mostrar el árbol real (`apps/mobile/`, `apps/api/`, `infra/docker/`, `openspec/`, `specs/` histórico, `docs/`, `memory/`).
- Actualizar "Requisitos de Desarrollo" añadiendo Go 1.25+ y Docker/Docker Compose junto a los ya existentes (Node, Rust, Android SDK).
- No se toca `openspec/config.yaml` ni `CLAUDE.md` (fuera de alcance, requieren aviso previo según el propio CLAUDE.md).

## Capabilities

Cambio puramente documental: no introduce ni modifica comportamiento observable del sistema. `.openspec.yaml` de este cambio declara `skip_specs: true`; no se crean ni modifican specs.

### New Capabilities
(ninguna)

### Modified Capabilities
(ninguna)

## Impact

- **Afectado**: `README.md` (raíz del repositorio) únicamente.
- **No afectado**: código de `apps/mobile/`, `apps/api/`, `infra/docker/`, `openspec/config.yaml`, `CLAUDE.md`, `specs/` (histórico congelado).
- **Referencias usadas para el contenido real**: `memory/context.md` (estado actual del proyecto), `openspec/specs/monorepo-layout/spec.md`, `openspec/specs/api-backend/`, `openspec/specs/local-dev-environment/`, ADR-032 y ADR-034 en `memory/decisions.md`.
