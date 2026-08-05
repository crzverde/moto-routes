## 1. Verificar estado real antes de escribir

- [x] 1.1 Confirmar contenido actual de `apps/mobile/package.json` y `apps/api/go.mod` (versiones exactas de dependencias a citar en el README)
- [x] 1.2 Confirmar comandos reales disponibles en `apps/mobile/package.json` (scripts `dev`, `test`, `lint`, `build`, `tauri:*`) y en `infra/docker/docker-compose.yml` (servicios y comandos para levantar `apps/api`)

## 2. Reescribir README.md

- [x] 2.1 Actualizar tabla de "Stack Tecnológico": mantener frontend/Tauri/Rust vigentes, añadir fila(s) de `apps/api` (Go 1.25, chi, pgx/v5, golang-jwt, bcrypt) y PostgreSQL 16 / Docker Compose
- [x] 2.2 Reescribir "Scripts Disponibles" reflejando que se ejecutan desde `apps/mobile/` (pnpm), y añadir cómo levantar `apps/api` (Docker Compose y/o `go run ./cmd/api`)
- [x] 2.3 Reescribir "Requisitos de Desarrollo" añadiendo Go 1.25+ y Docker/Docker Compose junto a los ya listados
- [x] 2.4 Actualizar "Instalación" para reflejar el flujo real: instalar dependencias del workspace pnpm (`apps/mobile`), y levantar `apps/api`+Postgres vía `infra/docker/docker-compose.yml`
- [x] 2.5 Reescribir "Estructura del Proyecto" con el árbol real: `apps/mobile/`, `apps/api/`, `infra/docker/`, `openspec/`, `specs/` (histórico), `docs/`, `memory/`
- [x] 2.6 Revisar el resto de secciones (Filosofía Visual, Metodología, Quality Gates, Documentación SDD) y corregir solo las rutas que hayan quedado obsoletas por el monorepo, sin reescribir lo que sigue siendo cierto

## 3. Verificación

- [x] 3.1 Releer el README completo y comprobar que cada comando y ruta citados existen tal cual en el repo (sin inventar scripts ni paths)
- [x] 3.2 Comprobar que no se ha tocado ningún fichero fuera de `README.md`

## 4. Cierre

- [x] 4.1 Actualizar `memory/context.md` con el cambio `actualizar-readme-monorepo` (README alineado con el monorepo)
