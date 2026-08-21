import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadRoutePhoto, deleteRoutePhoto, listRoutePhotos, downloadRoutePhoto, PhotoCloudApiError } from './photo-cloud-api.service.js';

const BASE_URL = 'http://localhost:8080';
const TOKEN = 'jwt-token';
const ROUTE_ID = 'route-1';

function stubFetch(response: { ok: boolean; status: number; json?: () => Promise<unknown> }): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const samplePhoto = { file: new Blob(['x'], { type: 'image/jpeg' }), filename: 'foto.jpg', latitude: 40.1, longitude: -3.1, capturedAt: '2026-08-09T10:00:00.000Z' };

describe('uploadRoutePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía un FormData con el campo photo y los metadatos opcionales, con el Bearer del token', async () => {
    const fetchMock = stubFetch({ ok: true, status: 201, json: () => Promise.resolve({ id: 'photo-remote-1' }) });

    const result = await uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/routes/${ROUTE_ID}/photos`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-token');
    const body = init.body as FormData;
    expect(body.get('photo')).toBeInstanceOf(Blob);
    expect(body.get('latitude')).toBe('40.1');
    expect(body.get('longitude')).toBe('-3.1');
    expect(body.get('captured_at')).toBe('2026-08-09T10:00:00.000Z');
    expect(result).toEqual({ id: 'photo-remote-1' });
  });

  it('omite latitude/longitude en el FormData cuando son null', async () => {
    const fetchMock = stubFetch({ ok: true, status: 201, json: () => Promise.resolve({ id: 'photo-remote-1' }) });

    await uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, { ...samplePhoto, latitude: null, longitude: null });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get('latitude')).toBeNull();
    expect(body.get('longitude')).toBeNull();
  });

  it('lanza PhotoCloudApiError kind "unauthorized" en 401', async () => {
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({ error: 'missing or invalid token' }) });

    const promise = uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    await expect(promise).rejects.toBeInstanceOf(PhotoCloudApiError);
    await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('lanza PhotoCloudApiError kind "not-found" en 404', async () => {
    stubFetch({ ok: false, status: 404, json: () => Promise.resolve({ error: 'route not found' }) });

    const promise = uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    await expect(promise).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lanza PhotoCloudApiError kind "too-large" en 400 con mensaje de tamaño', async () => {
    stubFetch({ ok: false, status: 400, json: () => Promise.resolve({ error: 'photo exceeds the maximum allowed size' }) });

    const promise = uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    await expect(promise).rejects.toMatchObject({ kind: 'too-large' });
  });

  it('lanza PhotoCloudApiError kind "too-many-photos" en 400 con mensaje de límite de fotos', async () => {
    stubFetch({ ok: false, status: 400, json: () => Promise.resolve({ error: 'route already has the maximum number of photos' }) });

    const promise = uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    await expect(promise).rejects.toMatchObject({ kind: 'too-many-photos' });
  });

  it('lanza PhotoCloudApiError kind "network" sin conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const promise = uploadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, samplePhoto);

    await expect(promise).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('deleteRoutePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama DELETE al endpoint de la foto con el Bearer del token y no lanza en éxito (204)', async () => {
    const fetchMock = stubFetch({ ok: true, status: 204 });

    await expect(deleteRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-remote-1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/routes/${ROUTE_ID}/photos/photo-remote-1`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-token');
  });

  it('lanza PhotoCloudApiError kind "not-found" en 404', async () => {
    stubFetch({ ok: false, status: 404, json: () => Promise.resolve({ error: 'photo not found' }) });

    const promise = deleteRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-remote-1');

    await expect(promise).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('listRoutePhotos', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama GET al endpoint de fotos de la ruta con el Bearer del token y mapea el shape snake_case', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { id: 'photo-1', route_id: ROUTE_ID, mime_type: 'image/jpeg', latitude: 40.1, longitude: -3.1, captured_at: '2026-08-09T10:00:00.000Z', created_at: '2026-08-09T10:05:00.000Z' },
      ]),
    });

    const result = await listRoutePhotos(BASE_URL, TOKEN, ROUTE_ID);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/routes/${ROUTE_ID}/photos`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-token');
    expect(result).toEqual([
      { id: 'photo-1', mimeType: 'image/jpeg', latitude: 40.1, longitude: -3.1, capturedAt: '2026-08-09T10:00:00.000Z', createdAt: '2026-08-09T10:05:00.000Z' },
    ]);
  });

  it('devuelve un array vacío cuando la ruta no tiene fotos', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve([]) });

    await expect(listRoutePhotos(BASE_URL, TOKEN, ROUTE_ID)).resolves.toEqual([]);
  });

  it('lanza PhotoCloudApiError kind "unauthorized" en 401', async () => {
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({ error: 'missing or invalid token' }) });

    const promise = listRoutePhotos(BASE_URL, TOKEN, ROUTE_ID);

    await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('lanza PhotoCloudApiError kind "not-found" en 404', async () => {
    stubFetch({ ok: false, status: 404, json: () => Promise.resolve({ error: 'route not found' }) });

    const promise = listRoutePhotos(BASE_URL, TOKEN, ROUTE_ID);

    await expect(promise).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lanza PhotoCloudApiError kind "network" sin conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const promise = listRoutePhotos(BASE_URL, TOKEN, ROUTE_ID);

    await expect(promise).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('downloadRoutePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama GET al endpoint de bytes de la foto con el Bearer del token y devuelve el Blob de la respuesta', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/routes/${ROUTE_ID}/photos/photo-1`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-token');
    expect(result).toBe(blob);
  });

  it('lanza PhotoCloudApiError kind "not-found" en 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: 'photo not found' }) }));

    const promise = downloadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-1');

    await expect(promise).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lanza PhotoCloudApiError kind "unauthorized" en 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'missing or invalid token' }) }));

    const promise = downloadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-1');

    await expect(promise).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('lanza PhotoCloudApiError kind "network" sin conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const promise = downloadRoutePhoto(BASE_URL, TOKEN, ROUTE_ID, 'photo-1');

    await expect(promise).rejects.toMatchObject({ kind: 'network' });
  });
});
