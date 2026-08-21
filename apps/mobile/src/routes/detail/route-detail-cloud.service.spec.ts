import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  uploadRouteToCloud, loadCloudRouteDetail, checkIfRouteIsSynced, autoResyncIfNeeded, uploadPhotoToCloud, deletePhotoFromCloud,
  loadCloudRoutePhotos,
} from './route-detail-cloud.service.js';
import { uploadRoute, fetchCloudRouteDetail, fetchCloudRoutes, RouteCloudApiError } from '../../shared/http/route-cloud-api.service.js';
import type * as RouteCloudApiService from '../../shared/http/route-cloud-api.service.js';
import {
  uploadRoutePhoto, deleteRoutePhoto, listRoutePhotos, downloadRoutePhoto, PhotoCloudApiError,
} from '../../shared/http/photo-cloud-api.service.js';
import type * as PhotoCloudApiService from '../../shared/http/photo-cloud-api.service.js';
import { checkAchievements } from '../../shared/http/achievement-api.service.js';
import { readPhotoBlob } from '../../shared/services/photo-storage.service.js';
import type * as PhotoStorageService from '../../shared/services/photo-storage.service.js';
import { showToast } from '../../shared/feedback/toast.js';
import { enqueueAchievementUnlock } from '../../shared/feedback/achievement-unlock-overlay.element.js';
import { MemoryRouteRepository } from '../../shared/repositories/memory-route.repository.js';
import type { IPhotoRepository } from '../../shared/models/photo.repository.js';
import type { Photo } from '../../shared/models/photo.types.js';
import type { Achievement } from '../../shared/models/achievement.types.js';

vi.mock('../../shared/http/route-cloud-api.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RouteCloudApiService>();
  return { ...actual, uploadRoute: vi.fn(), fetchCloudRouteDetail: vi.fn(), fetchCloudRoutes: vi.fn() };
});

vi.mock('../../shared/http/photo-cloud-api.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PhotoCloudApiService>();
  return {
    ...actual, uploadRoutePhoto: vi.fn(), deleteRoutePhoto: vi.fn(), listRoutePhotos: vi.fn(), downloadRoutePhoto: vi.fn(),
  };
});

vi.mock('../../shared/http/achievement-api.service.js', () => ({ checkAchievements: vi.fn() }));

vi.mock('../../shared/services/photo-storage.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PhotoStorageService>();
  return { ...actual, readPhotoBlob: vi.fn() };
});

vi.mock('../../shared/feedback/toast.js', () => ({ showToast: vi.fn((): (() => void) => (): void => undefined) }));
vi.mock('../../shared/feedback/achievement-unlock-overlay.element.js', () => ({ enqueueAchievementUnlock: vi.fn() }));

const BASE_URL = 'http://localhost:8080';
const SESSION = { token: 'jwt-token', email: 'rider@example.com' };

// Por defecto, ninguna comprobación de logros devuelve nada nuevo — los
// tests que sí quieren ejercitar el hook lo sobrescriben explícitamente.
beforeEach(() => {
  vi.mocked(checkAchievements).mockResolvedValue([]);
});

function makePhoto(overrides?: Partial<Photo>): Photo {
  return {
    id: 'photo-1',
    routeId: 'route-1',
    filePath: '/photos/photo-1.jpg',
    latitude: 40.1,
    longitude: -3.1,
    capturedAt: '2026-08-09T10:00:00.000Z',
    createdAt: '2026-08-09T10:00:00.000Z',
    remotePhotoId: null,
    ...overrides,
  };
}

function makePhotoRepo(): IPhotoRepository {
  return {
    add: vi.fn(),
    getByRouteId: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
    countByRouteId: vi.fn(),
    markPhotoSynced: vi.fn().mockResolvedValue(undefined),
  };
}

describe('uploadRouteToCloud', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lee los puntos/paradas del repositorio local y los sube junto a la ruta', async () => {
    const repository = new MemoryRouteRepository();
    const routeId = crypto.randomUUID();
    const route = await repository.save(
      { id: routeId, duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [{ routeId, timestamp: 1000, lat: 40.1, lng: -3.1, alt: 600, speed: 10 }],
      [{ routeId, startTime: 1200, endTime: 1300, lat: 40.15, lng: -3.15, type: 'manual', stopCategoryId: 1 }],
    );

    await uploadRouteToCloud(BASE_URL, SESSION, repository, route);

    expect(uploadRoute).toHaveBeenCalledWith(BASE_URL, SESSION.token, {
      route,
      points: [expect.objectContaining({ lat: 40.1 })],
      stops: [expect.objectContaining({ startTime: 1200 })],
    });
  });

  it('devuelve los puntos que le devuelve uploadRoute', async () => {
    const repository = new MemoryRouteRepository();
    const routeId = crypto.randomUUID();
    const route = await repository.save(
      { id: routeId, duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [{ routeId, timestamp: 1000, lat: 40.1, lng: -3.1, alt: 600, speed: 10 }],
      [],
    );
    const uploaded = [{ timestamp: 1000, lat: 40.1001, lng: -3.1001, alt: 600, speed: 10 }];
    vi.mocked(uploadRoute).mockResolvedValue(uploaded);

    await expect(uploadRouteToCloud(BASE_URL, SESSION, repository, route)).resolves.toEqual(uploaded);
  });

  it('propaga el error si la subida falla (sin conexión, límite de puntos, etc.)', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    vi.mocked(uploadRoute).mockRejectedValue(new Error('network down'));

    await expect(uploadRouteToCloud(BASE_URL, SESSION, repository, route)).rejects.toThrow('network down');
    expect(checkAchievements).not.toHaveBeenCalled();
  });

  it('tras subir con éxito, comprueba si se han desbloqueado logros nuevos y los encola', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    const unlocked: Achievement = {
      id: 1, key: 'total_km_100', requirementType: 'total_distance_km', threshold: 100,
      title: '100 km recorridos', description: 'Has superado los 100 km acumulados en tus rutas.', icon: 'default',
    };
    vi.mocked(uploadRoute).mockResolvedValue([]);
    vi.mocked(checkAchievements).mockResolvedValue([unlocked]);

    await uploadRouteToCloud(BASE_URL, SESSION, repository, route);

    expect(checkAchievements).toHaveBeenCalledWith(BASE_URL, SESSION.token);
    await vi.waitFor(() => {
      expect(enqueueAchievementUnlock).toHaveBeenCalledWith(unlocked);
    });
  });

  it('sin logros nuevos, no se encola ninguna animación', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    vi.mocked(uploadRoute).mockResolvedValue([]);
    vi.mocked(checkAchievements).mockResolvedValue([]);

    await uploadRouteToCloud(BASE_URL, SESSION, repository, route);

    await vi.waitFor(() => {
      expect(checkAchievements).toHaveBeenCalledWith(BASE_URL, SESSION.token);
    });
    expect(enqueueAchievementUnlock).not.toHaveBeenCalled();
  });

  it('si la comprobación de logros falla, la subida de la ruta sigue considerándose exitosa', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    vi.mocked(uploadRoute).mockResolvedValue([]);
    vi.mocked(checkAchievements).mockRejectedValue(new Error('network down'));

    await expect(uploadRouteToCloud(BASE_URL, SESSION, repository, route)).resolves.toEqual([]);
    expect(enqueueAchievementUnlock).not.toHaveBeenCalled();
  });
});

describe('loadCloudRouteDetail', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('descarga y adapta el detalle a los tipos locales', async () => {
    vi.mocked(fetchCloudRouteDetail).mockResolvedValue({
      id: 'cloud-1',
      createdAt: '2026-08-01T10:00:00.000Z',
      duration: 60,
      totalDistance: 10,
      avgSpeed: 30,
      status: 'completed',
      name: null,
      notes: null,
      isFavorite: false,
      points: [{ timestamp: 1000, lat: 40.1, lng: -3.1, alt: 600, speed: 10 }],
      stops: [],
    });

    const result = await loadCloudRouteDetail(BASE_URL, SESSION, 'cloud-1');

    expect(result.error).toBeUndefined();
    expect('route' in result && result.route.origin).toBe('remote');
    expect('points' in result && result.points).toHaveLength(1);
  });

  it('nunca lanza: un fallo de red se convierte en { error }', async () => {
    vi.mocked(fetchCloudRouteDetail).mockRejectedValue(new RouteCloudApiError('network', 'network down'));

    const result = await loadCloudRouteDetail(BASE_URL, SESSION, 'cloud-1');

    expect(result.error).toBe('network down');
  });
});

describe('checkIfRouteIsSynced', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve true si el id de la ruta aparece en el resumen de la nube', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'route-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 1, totalDistance: 1, avgSpeed: 1, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);

    await expect(checkIfRouteIsSynced(BASE_URL, SESSION, 'route-1')).resolves.toBe(true);
  });

  it('devuelve false si el id no aparece en el resumen de la nube', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);

    await expect(checkIfRouteIsSynced(BASE_URL, SESSION, 'route-1')).resolves.toBe(false);
  });

  it('ante un fallo de red, devuelve false en vez de lanzar', async () => {
    vi.mocked(fetchCloudRoutes).mockRejectedValue(new RouteCloudApiError('network', 'network down'));

    await expect(checkIfRouteIsSynced(BASE_URL, SESSION, 'route-1')).resolves.toBe(false);
  });
});

describe('autoResyncIfNeeded', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('si la ruta ya estaba sincronizada, la vuelve a subir sin ningún toast de éxito', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );
    vi.mocked(uploadRoute).mockResolvedValue([]);

    await autoResyncIfNeeded({ apiBaseUrl: BASE_URL, session: SESSION, repository, route, isSynced: true });

    expect(uploadRoute).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('si la ruta nunca se ha subido, no hace nada', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );

    await autoResyncIfNeeded({ apiBaseUrl: BASE_URL, session: SESSION, repository, route, isSynced: false });

    expect(uploadRoute).not.toHaveBeenCalled();
  });

  it('si la re-subida falla, muestra un aviso discreto sin lanzar', async () => {
    const repository = new MemoryRouteRepository();
    const route = await repository.save(
      { duration: 100, totalDistance: 10, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );
    vi.mocked(uploadRoute).mockRejectedValue(new Error('network down'));

    await expect(autoResyncIfNeeded({ apiBaseUrl: BASE_URL, session: SESSION, repository, route, isSynced: true })).resolves.toBeUndefined();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('network down'), 'error');
  });
});

describe('uploadPhotoToCloud', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('si la ruta está sincronizada, lee los bytes, sube la foto y marca el id remoto en el repositorio', async () => {
    const photoRepo = makePhotoRepo();
    const photo = makePhoto();
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    vi.mocked(readPhotoBlob).mockResolvedValue(blob);
    vi.mocked(uploadRoutePhoto).mockResolvedValue({ id: 'remote-photo-1' });

    await uploadPhotoToCloud({ apiBaseUrl: BASE_URL, session: SESSION, photoRepo, routeId: 'route-1', photo, isSynced: true });

    expect(readPhotoBlob).toHaveBeenCalledWith(photo.filePath);
    expect(uploadRoutePhoto).toHaveBeenCalledWith(BASE_URL, SESSION.token, 'route-1', expect.objectContaining({
      file: blob,
      latitude: 40.1,
      longitude: -3.1,
      capturedAt: photo.capturedAt,
    }));
    expect(photoRepo.markPhotoSynced).toHaveBeenCalledWith('photo-1', 'remote-photo-1');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('si la ruta no está sincronizada, no hace nada', async () => {
    const photoRepo = makePhotoRepo();

    await uploadPhotoToCloud({ apiBaseUrl: BASE_URL, session: SESSION, photoRepo, routeId: 'route-1', photo: makePhoto(), isSynced: false });

    expect(readPhotoBlob).not.toHaveBeenCalled();
    expect(uploadRoutePhoto).not.toHaveBeenCalled();
  });

  it('si la subida falla, muestra un aviso discreto sin lanzar y no marca la foto como sincronizada', async () => {
    const photoRepo = makePhotoRepo();
    vi.mocked(readPhotoBlob).mockResolvedValue(new Blob(['x']));
    vi.mocked(uploadRoutePhoto).mockRejectedValue(new Error('network down'));

    await expect(uploadPhotoToCloud({
      apiBaseUrl: BASE_URL, session: SESSION, photoRepo, routeId: 'route-1', photo: makePhoto(), isSynced: true,
    })).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('network down'), 'error');
    expect(photoRepo.markPhotoSynced).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la foto por tamaño excesivo, la foto local no se pierde ni se marca como sincronizada', async () => {
    const photoRepo = makePhotoRepo();
    vi.mocked(readPhotoBlob).mockResolvedValue(new Blob(['x']));
    vi.mocked(uploadRoutePhoto).mockRejectedValue(new PhotoCloudApiError('too-large', 'photo exceeds the maximum allowed size'));

    await expect(uploadPhotoToCloud({
      apiBaseUrl: BASE_URL, session: SESSION, photoRepo, routeId: 'route-1', photo: makePhoto(), isSynced: true,
    })).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('maximum allowed size'), 'error');
    expect(photoRepo.markPhotoSynced).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la foto porque la ruta ya alcanzó el máximo de fotos, la foto local no se pierde ni se marca como sincronizada', async () => {
    const photoRepo = makePhotoRepo();
    vi.mocked(readPhotoBlob).mockResolvedValue(new Blob(['x']));
    vi.mocked(uploadRoutePhoto).mockRejectedValue(new PhotoCloudApiError('too-many-photos', 'route already has the maximum number of photos'));

    await expect(uploadPhotoToCloud({
      apiBaseUrl: BASE_URL, session: SESSION, photoRepo, routeId: 'route-1', photo: makePhoto(), isSynced: true,
    })).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('maximum number of photos'), 'error');
    expect(photoRepo.markPhotoSynced).not.toHaveBeenCalled();
  });
});

describe('deletePhotoFromCloud', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('si la ruta está sincronizada y la foto tiene id remoto, la borra del servidor', async () => {
    vi.mocked(deleteRoutePhoto).mockResolvedValue(undefined);

    await deletePhotoFromCloud({ apiBaseUrl: BASE_URL, session: SESSION, routeId: 'route-1', remotePhotoId: 'remote-photo-1', isSynced: true });

    expect(deleteRoutePhoto).toHaveBeenCalledWith(BASE_URL, SESSION.token, 'route-1', 'remote-photo-1');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('si la foto nunca se subió (remotePhotoId null), no hace ninguna llamada de red', async () => {
    await deletePhotoFromCloud({ apiBaseUrl: BASE_URL, session: SESSION, routeId: 'route-1', remotePhotoId: null, isSynced: true });

    expect(deleteRoutePhoto).not.toHaveBeenCalled();
  });

  it('si la ruta no está sincronizada, no hace nada aunque haya id remoto', async () => {
    await deletePhotoFromCloud({ apiBaseUrl: BASE_URL, session: SESSION, routeId: 'route-1', remotePhotoId: 'remote-photo-1', isSynced: false });

    expect(deleteRoutePhoto).not.toHaveBeenCalled();
  });

  it('si el borrado remoto falla, muestra un aviso discreto sin lanzar', async () => {
    vi.mocked(deleteRoutePhoto).mockRejectedValue(new Error('network down'));

    await expect(deletePhotoFromCloud({
      apiBaseUrl: BASE_URL, session: SESSION, routeId: 'route-1', remotePhotoId: 'remote-photo-1', isSynced: true,
    })).resolves.toBeUndefined();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('network down'), 'error');
  });
});

describe('loadCloudRoutePhotos', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('lista las fotos y descarga sus bytes en paralelo, devolviendo PhotoWithUrl[] con objectUrl', async () => {
    vi.mocked(listRoutePhotos).mockResolvedValue([
      { id: 'photo-1', mimeType: 'image/jpeg', latitude: 40.1, longitude: -3.1, capturedAt: '2026-08-09T10:00:00.000Z', createdAt: '2026-08-09T10:05:00.000Z' },
    ]);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    vi.mocked(downloadRoutePhoto).mockResolvedValue(blob);
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-photo-1');
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: createObjectURLMock }));

    const result = await loadCloudRoutePhotos(BASE_URL, SESSION, 'route-1');

    expect(listRoutePhotos).toHaveBeenCalledWith(BASE_URL, SESSION.token, 'route-1');
    expect(downloadRoutePhoto).toHaveBeenCalledWith(BASE_URL, SESSION.token, 'route-1', 'photo-1');
    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(result.error).toBeNull();
    expect(result.photos).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        routeId: 'route-1',
        latitude: 40.1,
        longitude: -3.1,
        capturedAt: '2026-08-09T10:00:00.000Z',
        objectUrl: 'blob:mock-photo-1',
        remotePhotoId: 'photo-1',
      }),
    ]);
  });

  it('una ruta sin fotos devuelve photos: [] sin error', async () => {
    vi.mocked(listRoutePhotos).mockResolvedValue([]);

    const result = await loadCloudRoutePhotos(BASE_URL, SESSION, 'route-1');

    expect(result).toEqual({ photos: [], error: null });
    expect(downloadRoutePhoto).not.toHaveBeenCalled();
  });

  it('si el listado falla, nunca lanza: devuelve photos vacías con un mensaje de error', async () => {
    vi.mocked(listRoutePhotos).mockRejectedValue(new PhotoCloudApiError('network', 'network down'));

    const result = await loadCloudRoutePhotos(BASE_URL, SESSION, 'route-1');

    expect(result.photos).toEqual([]);
    expect(result.error).toContain('network down');
  });

  it('si la descarga de alguna foto falla, nunca lanza: devuelve photos vacías con un mensaje de error', async () => {
    vi.mocked(listRoutePhotos).mockResolvedValue([
      { id: 'photo-1', mimeType: 'image/jpeg', latitude: null, longitude: null, capturedAt: '2026-08-09T10:00:00.000Z', createdAt: '2026-08-09T10:05:00.000Z' },
    ]);
    vi.mocked(downloadRoutePhoto).mockRejectedValue(new PhotoCloudApiError('network', 'network down'));

    const result = await loadCloudRoutePhotos(BASE_URL, SESSION, 'route-1');

    expect(result.photos).toEqual([]);
    expect(result.error).toContain('network down');
  });
});
