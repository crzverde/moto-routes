# Moto Routes 🏍️

**Ride Tracker Mobile App** — Grabación de rutas GPS para motociclistas. Un cuaderno de bitácora que registra el viaje mientras ocurre: asfalto de noche, cuero oscuro y el ámbar cálido de un cuadro de instrumentos de moto.

Monorepo con dos aplicaciones: la app móvil (`apps/mobile/`) y su API backend (`apps/api/`), más la infraestructura Docker local (`infra/docker/`).

---

## Stack Tecnológico

### `apps/mobile/` — App móvil

| Componente | Tecnología |
|------------|-----------|
| Frontend | TypeScript 5.7 + Vite 6 + Web Components nativos |
| Backend móvil/desktop | Rust (stable, edition 2021) |
| Framework | Tauri 2 (Android, iOS, Desktop) |
| BBDD local | SQLite vía `@tauri-apps/plugin-sql` |
| Testing TS | Vitest 3 + jsdom (coverage ≥ 80%) |
| Testing E2E | Cypress 15 |
| Testing Rust | cargo test |
| Linting TS | ESLint 9 (strictTypeChecked + stylistic) |
| Linting Rust | Clippy (deny warnings) |
| Formato TS | Prettier 3 |
| Formato Rust | rustfmt |

### `apps/api/` — API backend

| Componente | Tecnología |
|------------|-----------|
| Lenguaje | Go 1.25 |
| Router | chi (`go-chi/chi/v5`) |
| Driver Postgres | pgx (`jackc/pgx/v5`) |
| Auth | JWT (`golang-jwt/jwt/v5`) + bcrypt (`golang.org/x/crypto`) |
| BBDD | PostgreSQL 16 (Docker, imagen `postgres:16-trixie`) |
| Testing | `go test ./...` (unit + integración real contra Postgres) |

### Transversal

| Componente | Tecnología |
|------------|-----------|
| Package manager (móvil) | pnpm (workspace: `apps/mobile`) |
| Package manager (API) | Go modules (`go.mod`) |
| Orquestación local | Docker Compose (`infra/docker/`) |
| Git Hooks | Husky 9 |
| Metodología | Spec-Driven Development sobre OpenSpec |

## Filosofía Visual

- **Concepto**: "Asfalto Nocturno" — cuero oscuro, negro asfalto y ámbar cálido. Dramático, no futurista: nada de HUDs, glassmorphism ni neón.
- **Modo oscuro obligatorio**: Por seguridad vial (sin deslumbramiento nocturno).
- **Paleta**: Asfalto/cuero (`--bg-top`/`--bg-bottom`/`--panel`), ámbar como único acento que brilla (`--amber`), línea de óxido de apoyo (`--rust-line`).
- **Tipografía**: Roboto Slab (titulares) + Barlow (interfaz) + Barlow Semi Condensed tabular (cifras, estilo cuentakilómetros).
- **Accesibilidad**: Hitboxes mínimas de 56×56px para uso con guantes de moto.
- **Design tokens**: Todos los valores CSS están en `apps/mobile/src/shared/styles/tokens.css`.
- **Documentación visual completa**: `specs/ui/design-system.md`.

## Scripts Disponibles

Los scripts de la app móvil se ejecutan desde `apps/mobile/` (workspace pnpm real del monorepo):

```bash
cd apps/mobile

# Desarrollo
pnpm dev                 # Servidor de desarrollo Vite
pnpm tauri:dev           # Tauri modo desarrollo (Android/iOS/Desktop)
pnpm tauri:android       # Tauri en Android (emulador/dispositivo)

# Testing
pnpm test                # Tests frontend (Vitest)
pnpm test:coverage       # Tests con cobertura
pnpm test:e2e            # Tests E2E (Cypress, levanta el server automáticamente)
pnpm rust:test           # Tests backend móvil (cargo test)

# Linting y formato
pnpm lint                # ESLint frontend
pnpm rust:lint           # Clippy backend móvil
pnpm format              # Prettier frontend
pnpm rust:format         # rustfmt backend móvil

# Build
pnpm build               # Build frontend (tsc + vite)
pnpm tauri:build         # Build Tauri producción
pnpm tauri:android:build # Build Android producción
pnpm rust:audit          # Auditoría de dependencias Rust
```

Desde la raíz del repositorio (documentación transversal y hooks, sin dependencias de ninguna app):

```bash
pnpm prepare             # Inicializar Husky
pnpm docs                # Genera la documentación completa (docs/)
```

Para levantar la API backend + PostgreSQL en local:

```bash
cd infra/docker
cp .env.example .env     # Ajustar si hace falta (valores triviales de desarrollo)
docker compose up --build
```

## Requisitos de Desarrollo

- **Node.js** >= 18
- **pnpm** (gestor del workspace de `apps/mobile`)
- **Rust** (latest stable) — [rustup.rs](https://rustup.rs)
- **Tauri CLI**: `cargo install tauri-cli`
- **Go** 1.25+ (para desarrollar `apps/api` fuera de Docker) — [go.dev/dl](https://go.dev/dl/)
- **Docker + Docker Compose** (para levantar `apps/api` + PostgreSQL en local)
- **Android (objetivo principal)**:
  - Android Studio (con Android SDK 34+)
  - Android NDK (via SDK Manager)
  - Java 17+
  - Variable `ANDROID_HOME` configurada
- **iOS** (futuro): Xcode + macOS

## Instalación

### 1. Setup de la app móvil

```bash
# 1. Instalar dependencias del workspace pnpm (apps/mobile)
cd apps/mobile
pnpm install

# 2. Inicializar Husky (desde la raíz del repo)
cd ..
pnpm prepare
```

### 2. Setup Android

```bash
cd apps/mobile

# 1. Setup automático (recomendado)
bash scripts/setup-android.sh

# 2. O manualmente:
npx tauri android init

# 3. Iniciar en dispositivo Android conectado o emulador
pnpm tauri:android

# 4. Build de producción Android
pnpm tauri:android:build
```

### Requisitos Android adicionales

Asegúrate de tener configurado el entorno Android:

```bash
# En Windows (PowerShell):
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')

# En Linux/macOS (.bashrc / .zshrc):
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin

# Verificar:
echo $ANDROID_HOME
```

### 3. Setup de la API backend

```bash
cd infra/docker
cp .env.example .env
docker compose up --build
```

La API queda escuchando en `http://localhost:8080`; PostgreSQL en el puerto `5432`.

## Estructura del Proyecto

```
package.json                  # Raíz: solo docs:* (typedoc/vitepress) + husky, sin deps de ninguna app
pnpm-workspace.yaml           # packages: [apps/mobile]
apps/
├── mobile/                   # App móvil (Tauri + frontend)
│   ├── src/                  # Frontend (TypeScript + Vite)
│   │   ├── app/               # Componente raíz (Cockpit)
│   │   ├── cockpit/            # Dominio "cockpit" (grabación de ruta)
│   │   ├── routes/             # Dominio "routes" (listado, detalle, timeline)
│   │   ├── shared/
│   │   │   ├── styles/tokens.css     # Design tokens globales
│   │   │   ├── repositories/         # Repositorios SQLite
│   │   │   └── tauri/commands.ts     # Wrappers tipados invoke()
│   │   ├── index.css                 # Estilos base
│   │   ├── main.ts                   # Entry point
│   │   └── vite-env.d.ts             # Type declarations
│   ├── src-tauri/             # Backend móvil (Rust)
│   │   ├── src/
│   │   │   ├── main.rs               # Entry point
│   │   │   ├── lib.rs                # Librería Tauri
│   │   │   └── commands/mod.rs       # Comandos Tauri
│   │   ├── capabilities/default.json # Permisos mínimos
│   │   ├── tauri.conf.json           # Configuración Tauri
│   │   └── Cargo.toml                # Dependencias Rust
│   ├── cypress/                # Tests E2E
│   ├── tests/                  # Test setup Vitest
│   └── scripts/                # kill-port.mjs, setup-android.sh, pull-db.*
└── api/                      # API backend (Go)
    ├── cmd/api/main.go          # Entry point: router chi, wiring de handlers/middleware
    ├── internal/                # auth, config, migrate, httpmw, ping, stoptypes...
    ├── Dockerfile                # Multi-stage: golang:1.25-trixie → debian:trixie-slim
    └── go.mod, go.sum
infra/
└── docker/
    ├── docker-compose.yml    # Servicios api + postgres, solo desarrollo local
    ├── postgres/init.sql
    ├── .env.example           # Versionado — claves sin valores reales
    └── .env                   # NO versionado (.gitignore)
openspec/                     # Source of truth SDD
├── config.yaml               # Configuración del proyecto
├── specs/                    # Specs vivas
└── changes/                  # Cambios en curso
specs/                        # Histórico congelado (SDD anterior)
├── features/                 # Features cerradas
└── ui/                       # Design system y convenciones
docs/                         # Documentación arquitectura
memory/                       # Sistema de memoria persistente
```

## Metodología

Este proyecto sigue **Spec-Driven Development** sobre [OpenSpec](https://github.com/Fission-AI/OpenSpec). No se escribe código sin un cambio abierto en `openspec/changes/`.

1. **PROPOSE** (`/opsx:propose`) → `proposal.md` · delta specs · `design.md` · `tasks.md`
2. **APPLY** (`/opsx:apply`) → código + tests (TDD: RED → GREEN → REFACTOR)
3. **ARCHIVE** (`/opsx:archive`) → gate de revisión, veredicto y deltas fundidos en `openspec/specs/`

La metodología completa vive en `openspec/config.yaml`. Ver `docs/01-arquitectura-sdd.md`.

## Quality Gates

- ✅ Test pass rate: 100% (frontend, backend móvil, API)
- ✅ Code coverage (TS): ≥ 80%
- ✅ AC coverage: 100%
- ✅ ESLint: 0 warnings, 0 errors
- ✅ Clippy: 0 warnings
- ✅ `govulncheck` (Go): 0 vulnerabilidades alcanzables
- ✅ Build: tsc + vite + cargo + tauri + go build sin errores

## Documentación SDD

| Documento | Descripción |
|-----------|-------------|
| `docs/01-arquitectura-sdd.md` | Arquitectura SDD |
| `docs/02-workflow-sdd.md` | Workflow completo |
| `docs/03-configuracion-openspec.md` | Configuración de OpenSpec |
| `docs/04-token-management.md` | Gestión de tokens |
| `docs/05-memory-system.md` | Sistema de memoria |
| `docs/06-seguridad.md` | Seguridad y CSP |
| `docs/07-cypress-e2e.md` | Tests E2E con Cypress |
