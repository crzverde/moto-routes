import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensurePreviewPolyline, ensureCloudPreviewPolyline } from './route-list-polyline.service.js';
import { fetchCloudRouteDetail, RouteCloudApiError } from '../../shared/http/route-cloud-api.service.js';
import type * as RouteCloudApiService from '../../shared/http/route-cloud-api.service.js';
import type { IRouteRepository } from '../../shared/models/route.repository.js';
import type { Route, RoutePoint } from '../../shared/models/route.types.js';
import type { Session } from '../../shared/models/session.types.js';

vi.mock('../../shared/http/route-cloud-api.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RouteCloudApiService>();
  return { ...actual, fetchCloudRouteDetail: vi.fn() };
});

function buildRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'r1',
    createdAt: new Date().toISOString(),
    duration: 100,
    totalDistance: 10,
    avgSpeed: 30,
    status: 'completed',
    visibility: 'private',
    origin: 'local',
    previewPolyline: null,
    name: null,
    notes: null,
    isFavorite: false,
    ...overrides,
  };
}

function buildPoint(lat: number, lng: number): RoutePoint {
  return { id: crypto.randomUUID(), routeId: 'r1', timestamp: Date.now(), lat, lng, alt: 0, speed: 0 };
}

function buildMockRepo(points: RoutePoint[]): IRouteRepository {
  return {
    save: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    getPointsByRouteId: vi.fn().mockResolvedValue(points),
    getStopsByRouteId: vi.fn(),
    delete: vi.fn(),
    updatePreviewPolyline: vi.fn().mockResolvedValue(undefined),
    updateNotes: vi.fn().mockResolvedValue(undefined),
    updateFavorite: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ensurePreviewPolyline (AC-031, AC-024)', () => {
  it('computes and persists the polyline exactly once when the route has no previewPolyline but has points (AC-031)', async () => {
    const points = [buildPoint(10, 20), buildPoint(11, 21)];
    const repo = buildMockRepo(points);
    const route = buildRoute();

    const result = await ensurePreviewPolyline(repo, route);

    expect(repo.updatePreviewPolyline).toHaveBeenCalledOnce();
    expect(result).toEqual([
      [10, 20],
      [11, 21],
    ]);
  });

  it('does not recompute on a second load when the route already has a previewPolyline (AC-031)', async () => {
    const repo = buildMockRepo([buildPoint(10, 20), buildPoint(11, 21)]);
    const existingPolyline: [number, number][] = [
      [1, 2],
      [3, 4],
    ];
    const route = buildRoute({ previewPolyline: existingPolyline });

    const result = await ensurePreviewPolyline(repo, route);

    expect(repo.getPointsByRouteId).not.toHaveBeenCalled();
    expect(repo.updatePreviewPolyline).not.toHaveBeenCalled();
    expect(result).toEqual(existingPolyline);
  });

  it('returns null without throwing and without persisting when there are no route_points (AC-024)', async () => {
    const repo = buildMockRepo([]);
    const route = buildRoute();

    await expect(ensurePreviewPolyline(repo, route)).resolves.toBeNull();
    expect(repo.updatePreviewPolyline).not.toHaveBeenCalled();
  });
});

const BASE_URL = 'http://localhost:8080';
const SESSION: Session = { token: 'jwt-token', email: 'rider@example.com' };

describe('ensureCloudPreviewPolyline', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('descarga los puntos de la ruta vía fetchCloudRouteDetail y devuelve el trazado simplificado', async () => {
    vi.mocked(fetchCloudRouteDetail).mockResolvedValue({
      id: 'cloud-1', createdAt: new Date().toISOString(), duration: 100, totalDistance: 10, avgSpeed: 30,
      status: 'completed', name: null, notes: null, isFavorite: false,
      points: [
        { timestamp: 1000, lat: 10, lng: 20, alt: 0, speed: 0 },
        { timestamp: 2000, lat: 11, lng: 21, alt: 0, speed: 0 },
      ],
      stops: [],
    });
    const route = buildRoute({ id: 'cloud-1', origin: 'remote' });

    const result = await ensureCloudPreviewPolyline(BASE_URL, SESSION, route);

    expect(fetchCloudRouteDetail).toHaveBeenCalledWith(BASE_URL, SESSION.token, 'cloud-1');
    expect(result).toEqual([
      [10, 20],
      [11, 21],
    ]);
  });

  it('si route.previewPolyline ya está calculado, lo devuelve tal cual sin llamar a fetchCloudRouteDetail', async () => {
    const existingPolyline: [number, number][] = [[1, 2], [3, 4]];
    const route = buildRoute({ id: 'cloud-1', origin: 'remote', previewPolyline: existingPolyline });

    const result = await ensureCloudPreviewPolyline(BASE_URL, SESSION, route);

    expect(fetchCloudRouteDetail).not.toHaveBeenCalled();
    expect(result).toEqual(existingPolyline);
  });

  it('devuelve null sin lanzar cuando la ruta no tiene ningún punto', async () => {
    vi.mocked(fetchCloudRouteDetail).mockResolvedValue({
      id: 'cloud-1', createdAt: new Date().toISOString(), duration: 100, totalDistance: 10, avgSpeed: 30,
      status: 'completed', name: null, notes: null, isFavorite: false, points: [], stops: [],
    });
    const route = buildRoute({ id: 'cloud-1', origin: 'remote' });

    await expect(ensureCloudPreviewPolyline(BASE_URL, SESSION, route)).resolves.toBeNull();
  });

  it('devuelve null sin lanzar cuando fetchCloudRouteDetail falla (red, 404)', async () => {
    vi.mocked(fetchCloudRouteDetail).mockRejectedValue(new RouteCloudApiError('network', 'network down'));
    const route = buildRoute({ id: 'cloud-1', origin: 'remote' });

    await expect(ensureCloudPreviewPolyline(BASE_URL, SESSION, route)).resolves.toBeNull();
  });
});
