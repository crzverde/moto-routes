/// <reference types="cypress" />

/**
 * E2E de `route-cloud-sync` (ampliación `fotos-rutas-cloud-only`): fotos de
 * una ruta exclusiva de la nube (sembrada vía API, nunca grabada en este
 * dispositivo) — backend real (`docker compose up` en `infra/docker/`), sin
 * mockear `apps/api`, mismo criterio que `route-cloud-sync.cy.ts`. Fichero
 * aparte (no ampliar `route-cloud-sync.cy.ts`, que ya roza el límite de
 * `max-lines`, ver tasks.md 5.1).
 */

import type { Route, RoutePoint } from '../../../src/shared/models/route.types.js';

const TEST_EMAIL_PREFIX = 'cypress-routes-cloud-photos';
const TEST_PASSWORD = 'correct-horse-battery';
const API_BASE_URL = 'http://localhost:8080';

function uniqueTestEmail(suffix: string): string {
  return `${TEST_EMAIL_PREFIX}-${String(Date.now())}-${suffix}@example.com`;
}

function markEmailVerified(email: string): Cypress.Chainable {
  return cy.exec(
    `docker exec docker-postgres-1 psql -U motoroutes -d motoroutes -c "UPDATE users SET email_verified = true WHERE email = '${email}';"`,
  );
}

function registerVerifiedAccountViaApi(email: string): Cypress.Chainable<string> {
  return cy
    .request('POST', `${API_BASE_URL}/api/auth/register`, { email, password: TEST_PASSWORD })
    .then(() => markEmailVerified(email))
    .then(() => cy.request('POST', `${API_BASE_URL}/api/auth/login`, { email, password: TEST_PASSWORD }))
    .then((res) => (res.body as { token: string }).token);
}

function buildSeedRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    duration: 1800,
    totalDistance: 12.5,
    avgSpeed: 42,
    status: 'completed',
    visibility: 'private',
    origin: 'local',
    previewPolyline: null,
    name: `Ruta test ${String(Date.now())}`,
    notes: null,
    isFavorite: false,
    ...overrides,
  };
}

/** Sube una ruta directamente vía API (sin UI) — para sembrar una ruta "exclusiva de la nube". */
function uploadRouteViaApi(token: string, route: Route, points: RoutePoint[] = []): Cypress.Chainable {
  return cy.request({
    method: 'POST',
    url: `${API_BASE_URL}/api/routes`,
    headers: { Authorization: `Bearer ${token}` },
    body: {
      id: route.id,
      created_at: route.createdAt,
      duration: route.duration,
      total_distance: route.totalDistance,
      avg_speed: route.avgSpeed,
      status: route.status,
      name: route.name,
      notes: route.notes,
      is_favorite: route.isFavorite,
      points: points.map((p) => ({ timestamp: p.timestamp, lat: p.lat, lng: p.lng, alt: p.alt, speed: p.speed })),
      stops: [],
    },
  });
}

/**
 * Sube una foto directamente vía API (sin UI, sin dispositivo local que
 * respalde la ruta) — `cy.request` no arma un `multipart/form-data` real, así
 * que se usa el `fetch` de la propia ventana ya visitada (mismo origen que la
 * app, sin problema de CORS) para enviar un `FormData` de verdad.
 */
function uploadPhotoViaApi(token: string, routeId: string): Cypress.Chainable<{ id: string }> {
  return cy.fixture('photo-sample.jpg', 'base64').then((base64: string) => {
    const blob = Cypress.Blob.base64StringToBlob(base64, 'image/jpeg');
    return cy.window().then((win) => {
      const formData = new win.FormData();
      formData.append('photo', blob, 'photo-sample.jpg');
      formData.append('captured_at', new Date().toISOString());
      return cy.wrap(
        win.fetch(`${API_BASE_URL}/api/routes/${routeId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }).then((res) => res.json() as Promise<{ id: string }>),
        { timeout: 10000 },
      );
    });
  });
}

function loginViaUi(email: string): void {
  cy.get('[data-cy="nav-perfil"]').click();
  cy.get('[data-cy="auth-btn-abrir-login"]').click();
  cy.get('[data-cy="auth-input-email-login"]').type(email);
  cy.get('[data-cy="auth-input-password-login"]').type(TEST_PASSWORD);
  cy.get('[data-cy="auth-btn-confirmar-login"]').click();
  cy.get('[data-cy="auth-dialog-login"]').should('not.exist');
}

describe('Fotos de una ruta exclusiva de la nube (fotos-rutas-cloud-only)', () => {
  after(() => {
    cy.exec(
      `docker exec docker-postgres-1 psql -U motoroutes -d motoroutes -c "DELETE FROM users WHERE email LIKE '${TEST_EMAIL_PREFIX}-%';"`,
      { failOnNonZeroExit: false },
    );
  });

  it('las fotos de una ruta cloud-only se descargan y se muestran en la galería, sin botón de añadir', () => {
    const email = uniqueTestEmail('con-fotos');
    const route = buildSeedRoute({ name: `Ruta cloud con fotos ${String(Date.now())}` });
    const points: RoutePoint[] = [
      { id: crypto.randomUUID(), routeId: route.id, timestamp: Date.now() - 60_000, lat: 41.38, lng: 2.17, alt: 10, speed: 40 },
      { id: crypto.randomUUID(), routeId: route.id, timestamp: Date.now(), lat: 41.39, lng: 2.18, alt: 12, speed: 45 },
    ];

    cy.visitWithSeed({});
    registerVerifiedAccountViaApi(email).then((token) => {
      uploadRouteViaApi(token, route, points).then(() => {
        uploadPhotoViaApi(token, route.id).then(() => {
          uploadPhotoViaApi(token, route.id).then(() => {
            loginViaUi(email);

            cy.get('[data-cy="nav-rutas"]').click();
            cy.contains('[data-cy="route-card"]', route.name as string).click();

            cy.get('[data-cy="route-detail-load-error"]').should('not.exist');
            cy.get('[data-cy="tab-bar-btn-fotos"]').click();
            cy.get('[data-cy="photo-thumbnail"]').should('have.length', 2);
            cy.get('[data-cy="detail-photo-capture"]').should('not.exist');
          });
        });
      });
    });
  });

  it('una ruta cloud-only sin fotos muestra el detalle con normalidad, sin hueco ni error', () => {
    const email = uniqueTestEmail('sin-fotos');
    const route = buildSeedRoute({ name: `Ruta cloud sin fotos ${String(Date.now())}` });

    cy.visitWithSeed({});
    registerVerifiedAccountViaApi(email).then((token) => {
      uploadRouteViaApi(token, route).then(() => {
        loginViaUi(email);

        cy.get('[data-cy="nav-rutas"]').click();
        cy.contains('[data-cy="route-card"]', route.name as string).click();

        cy.get('[data-cy="route-detail-load-error"]').should('not.exist');
        cy.get('[data-cy="route-detail-title"]').should('contain', route.name as string);
        cy.get('[data-cy="tab-bar-btn-fotos"]').click();
        cy.get('[data-cy="photo-placeholder"]').should('exist');
        cy.get('[data-cy="photo-toast-error"]').should('not.exist');
      });
    });
  });
});
