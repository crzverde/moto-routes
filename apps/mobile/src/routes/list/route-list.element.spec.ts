import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryRouteRepository } from '../../shared/repositories/memory-route.repository.js';
import { MemorySessionRepository } from '../../shared/repositories/memory-session.repository.js';
import type { IRouteRepository } from '../../shared/models/route.repository.js';
import type { ISessionRepository } from '../../shared/models/session.repository.js';
import { fetchCloudRoutes, fetchCloudRouteDetail } from '../../shared/http/route-cloud-api.service.js';
import type * as RouteCloudApiService from '../../shared/http/route-cloud-api.service.js';
import { autoResyncIfNeeded } from '../detail/route-detail-cloud.service.js';
import type * as RouteDetailCloudService from '../detail/route-detail-cloud.service.js';
import { fetchReceivedInvitations } from '../../shared/http/route-sharing-api.service.js';
import type * as RouteSharingApiService from '../../shared/http/route-sharing-api.service.js';
import './route-list.element.js';

vi.mock('../../shared/http/route-cloud-api.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RouteCloudApiService>();
  return { ...actual, fetchCloudRoutes: vi.fn(), fetchCloudRouteDetail: vi.fn() };
});

vi.mock('../../shared/http/route-sharing-api.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RouteSharingApiService>();
  return { ...actual, fetchReceivedInvitations: vi.fn() };
});

vi.mock('../detail/route-detail-cloud.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof RouteDetailCloudService>();
  return { ...actual, autoResyncIfNeeded: vi.fn() };
});

async function waitRender(): Promise<void> {
  // 50ms: el borrado de ruta encadena confirmDialog + un import() dinámico
  // (getPhotoRepo) antes de refrescar — bajo carga (suite completa + cobertura
  // v8) un margen menor resultaba intermitente en otros specs similares.
  await new Promise((r) => setTimeout(r, 50));
}

async function createList(repo: IRouteRepository): Promise<HTMLElement> {
  const list = document.createElement('route-list') as HTMLElement & { repository: IRouteRepository };
  list.repository = repo;
  document.body.appendChild(list);
  await waitRender();
  return list;
}

function currentThumb(list: HTMLElement): Element {
  return list.shadowRoot!.querySelector('.thumb')!;
}

describe('route-list - listado y tarjetas', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  it('shows a loading state synchronously while the initial fetch is in flight (AC-010)', () => {
    const list = document.createElement('route-list') as HTMLElement & { repository: IRouteRepository };
    list.repository = repo;
    document.body.appendChild(list);

    // fetchAndRender hace su primer render (loading) antes del primer await —
    // se puede observar sin esperar ningún microtask.
    expect(list.shadowRoot!.querySelector('[data-cy="route-list-loading"]')).not.toBeNull();
    document.body.removeChild(list);
  });

  it('replaces the loading state with the routes once the fetch resolves', async () => {
    const list = await createList(repo);
    const root = list.shadowRoot!;
    expect(root.querySelector('[data-cy="route-list-loading"]')).toBeNull();
    expect(root.querySelector('.route-list__empty')).not.toBeNull();
    document.body.removeChild(list);
  });

  it('should show empty message when no routes', async () => {
    const list = await createList(repo);
    const root = list.shadowRoot!;
    const empty = root.querySelector('.route-list__empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No hay rutas guardadas');
    document.body.removeChild(list);
  });

  it('should render 2 route cards when 2 routes exist', async () => {
    await repo.save(
      { duration: 300, totalDistance: 10, avgSpeed: 60, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    await repo.save(
      { duration: 600, totalDistance: 20, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const cards = root.querySelectorAll('.route-card');
    expect(cards.length).toBe(2);
    document.body.removeChild(list);
  });

  it('each rendered card has data-cy="route-card" (AC-039)', async () => {
    await repo.save(
      { duration: 300, totalDistance: 10, avgSpeed: 60, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    await repo.save(
      { duration: 600, totalDistance: 20, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const cards = root.querySelectorAll('[data-cy="route-card"]');
    expect(cards.length).toBe(2);
    document.body.removeChild(list);
  });

  it('the empty state has data-cy="route-list-empty" and no data-cy="route-card" appears (AC-040)', async () => {
    const list = await createList(repo);
    const root = list.shadowRoot!;
    expect(root.querySelector('[data-cy="route-list-empty"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-cy="route-card"]').length).toBe(0);
    document.body.removeChild(list);
  });

  it('should show subtitle with count and total km', async () => {
    await repo.save(
      { duration: 100, totalDistance: 15.5, avgSpeed: 40, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    await repo.save(
      { duration: 200, totalDistance: 25.3, avgSpeed: 45, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const subtitle = root.querySelector('.route-list__subtitle');
    expect(subtitle).not.toBeNull();
    expect(subtitle?.textContent).toContain('2 rutas guardadas');
    expect(subtitle?.textContent).toContain('40.8 km recorridos');
    document.body.removeChild(list);
  });

});

describe('route-list - estructura de tarjeta', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  it('should render card structure with thumb, name, date, and badges', async () => {
    await repo.save(
      { duration: 420, totalDistance: 46.2, avgSpeed: 55, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const card = root.querySelector('.route-card');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.thumb')).not.toBeNull();
    expect(card?.querySelector('.name')).not.toBeNull();
    expect(card?.querySelector('.date')).not.toBeNull();
    expect(card?.querySelector('.badge.distance')).not.toBeNull();
    expect(card?.querySelector('.badge.duration')).not.toBeNull();
    document.body.removeChild(list);
  });
});

describe('route-list - nombre de ruta (AC-005, AC-007)', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  it('shows the persisted name in the card .name when the route has one (AC-005)', async () => {
    await repo.save(
      { duration: 300, totalDistance: 10, avgSpeed: 60, status: 'completed', visibility: 'private', origin: 'local', name: 'Puerto de la Bonaigua' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    expect(root.querySelector('.name')?.textContent).toBe('Puerto de la Bonaigua');
    document.body.removeChild(list);
  });

  it('falls back to the "Ruta {fecha}" text when name is null (AC-007)', async () => {
    await repo.save(
      { duration: 300, totalDistance: 10, avgSpeed: 60, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    expect(root.querySelector('.name')?.textContent).toContain('Ruta ');
    document.body.removeChild(list);
  });
});

describe('route-list - eventos e interacción', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  it('should emit view-route event when card is clicked', async () => {
    await repo.save(
      { duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const card = root.querySelector('.route-card') as HTMLElement;

    const handler = vi.fn();
    window.addEventListener('view-route', handler);
    card?.click();

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0]![0] as CustomEvent<{ routeId: string }>).detail.routeId).toBeTypeOf('string');
    window.removeEventListener('view-route', handler);
    document.body.removeChild(list);
  });

  it('shows a confirm dialog when the delete button is clicked, without also navigating to the route (AC-008)', async () => {
    await repo.save(
      { duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );
    const list = await createList(repo);
    const root = list.shadowRoot!;
    const deleteBtn = root.querySelector('[data-cy="route-card-btn-eliminar"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.querySelector('svg')).not.toBeNull();
    expect(deleteBtn.textContent).not.toContain('🗑');

    const viewHandler = vi.fn();
    window.addEventListener('view-route', viewHandler);
    deleteBtn.click();
    await waitRender();

    expect(document.body.querySelector('confirm-dialog')).not.toBeNull();
    expect(viewHandler).not.toHaveBeenCalled();

    window.removeEventListener('view-route', viewHandler);
    document.body.querySelector('confirm-dialog')?.remove();
    document.body.removeChild(list);
  });

  it('deletes the route and shows a toast when the deletion is confirmed, without reloading the screen (AC-008)', async () => {
    const saved = await repo.save(
      { duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );
    const list = await createList(repo);
    const root = list.shadowRoot!;
    (root.querySelector('[data-cy="route-card-btn-eliminar"]') as HTMLButtonElement).click();
    await waitRender();

    const dialog = document.body.querySelector('confirm-dialog')!;
    const confirmBtn = dialog.shadowRoot!.querySelector('[data-cy="confirm-dialog-action-confirm"]') as HTMLButtonElement;
    confirmBtn.click();
    await waitRender();

    expect(await repo.getById(saved.id)).toBeNull();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(0);
    expect(document.body.querySelector('[data-cy="photo-toast"]')?.textContent).toBe('Ruta eliminada');
    document.body.removeChild(list);
  });

  it('does not delete the route when the deletion is cancelled', async () => {
    const saved = await repo.save(
      { duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' },
      [], [],
    );
    const list = await createList(repo);
    const root = list.shadowRoot!;
    (root.querySelector('[data-cy="route-card-btn-eliminar"]') as HTMLButtonElement).click();
    await waitRender();

    const dialog = document.body.querySelector('confirm-dialog')!;
    const cancelBtn = dialog.shadowRoot!.querySelector('[data-cy="confirm-dialog-action-cancel"]') as HTMLButtonElement;
    cancelBtn.click();
    await waitRender();

    expect(await repo.getById(saved.id)).not.toBeNull();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(1);
    document.body.removeChild(list);
  });

  it('should refetch and render newly saved routes when the "nav-rutas" event fires', async () => {
    const list = await createList(repo);
    let root = list.shadowRoot!;
    expect(root.querySelector('.route-list__empty')).not.toBeNull();

    await repo.save(
      { duration: 300, totalDistance: 10, avgSpeed: 60, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    window.dispatchEvent(new CustomEvent('nav-rutas'));
    await waitRender();

    root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card').length).toBe(1);
    expect(root.querySelector('.route-list__empty')).toBeNull();
    document.body.removeChild(list);
  });
});

describe('route-list - trazado SVG y backfill perezoso (AC-021, AC-022, AC-023, AC-024, AC-031)', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  it('renders an svg with a path inside .thumb, without the media-placeholder class, when previewPolyline is already saved (AC-021)', async () => {
    const saved = await repo.save(
      { duration: 100, totalDistance: 5, avgSpeed: 20, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );
    await repo.updatePreviewPolyline(saved.id, [
      [10, 20],
      [11, 21],
      [12, 22],
    ]);

    const list = await createList(repo);
    const root = list.shadowRoot!;
    const card = root.querySelector('.route-card')!;
    const thumb = card.querySelector('.thumb')!;
    expect(thumb.classList.contains('media-placeholder')).toBe(false);
    expect(thumb.querySelector('svg path[data-cy="route-card-trace"]')).not.toBeNull();
    document.body.removeChild(list);
  });

  it('keeps showing the striped placeholder without throwing when the route has neither previewPolyline nor route_points (AC-022, AC-024)', async () => {
    await repo.save(
      { duration: 100, totalDistance: 5, avgSpeed: 20, status: 'completed', visibility: 'private', origin: 'local' },
      [],
      [],
    );

    const list = await createList(repo);
    await waitRender();
    const root = list.shadowRoot!;
    const thumb = root.querySelector('.thumb')!;
    expect(thumb.classList.contains('media-placeholder')).toBe(true);
    expect(thumb.querySelector('svg')).toBeNull();
    document.body.removeChild(list);
  });

  it('shows the placeholder on first render, then swaps to the svg once the background backfill resolves, without recomputing on a second load (AC-023, AC-031)', async () => {
    const routeId = crypto.randomUUID();
    await repo.save(
      { id: routeId, duration: 100, totalDistance: 5, avgSpeed: 20, status: 'completed', visibility: 'private', origin: 'local' },
      [
        { routeId, timestamp: 1, lat: 10, lng: 20, alt: 0, speed: 0 },
        { routeId, timestamp: 2, lat: 11, lng: 21, alt: 0, speed: 0 },
      ],
      [],
    );
    const persistedPoints = await repo.getPointsByRouteId(routeId);

    // Retrasa deliberadamente la respuesta de getPointsByRouteId para poder
    // observar el estado intermedio: placeholder pintado antes de que el
    // backfill en segundo plano resuelva.
    let resolvePoints!: (points: typeof persistedPoints) => void;
    const deferred = new Promise<typeof persistedPoints>((resolve) => {
      resolvePoints = resolve;
    });
    vi.spyOn(repo, 'getPointsByRouteId').mockReturnValueOnce(deferred);
    const updateSpy = vi.spyOn(repo, 'updatePreviewPolyline');

    // Monta primero y asigna el repositorio después: evita que `connectedCallback`
    // y el setter de `repository` disparen dos `fetchAndRender()` concurrentes
    // (lo que haría el `getPointsByRouteId` mockeado solo "una vez" impredecible).
    const list = document.createElement('route-list') as HTMLElement & { repository: IRouteRepository };
    document.body.appendChild(list);
    list.repository = repo;
    await waitRender();
    expect(currentThumb(list).classList.contains('media-placeholder')).toBe(true);
    expect(updateSpy).not.toHaveBeenCalled();

    // Ahora resuelve la respuesta pendiente: el backfill en segundo plano completa.
    resolvePoints(persistedPoints);
    await waitRender();
    expect(currentThumb(list).classList.contains('media-placeholder')).toBe(false);
    expect(currentThumb(list).querySelector('svg path[data-cy="route-card-trace"]')).not.toBeNull();
    expect(updateSpy).toHaveBeenCalledOnce();

    // Segunda carga del listado (ej. volver a abrir): no se recalcula de nuevo.
    window.dispatchEvent(new CustomEvent('nav-rutas'));
    await waitRender();
    expect(currentThumb(list).querySelector('svg path[data-cy="route-card-trace"]')).not.toBeNull();
    expect(updateSpy).toHaveBeenCalledOnce();

    document.body.removeChild(list);
  });
});

describe('route-list - indicador de sincronización con la nube', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function createListWithSession(): Promise<{ list: HTMLElement; sessionRepository: ISessionRepository }> {
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });
    const list = document.createElement('route-list') as HTMLElement & {
      repository: IRouteRepository;
      sessionRepository: ISessionRepository;
    };
    list.sessionRepository = sessionRepository;
    list.repository = repo;
    document.body.appendChild(list);
    await waitRender();
    return { list, sessionRepository };
  }

  it('sin sesión activa, no muestra ningún indicador de nube (comportamiento idéntico al actual)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    const list = await createList(repo);

    expect(list.shadowRoot!.querySelector('[data-cy="route-card-sync-badge"]')).toBeNull();
    document.body.removeChild(list);
  });

  it('con sesión activa, una ruta sin subir se marca "Solo local"', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);

    const { list } = await createListWithSession();

    const badge = list.shadowRoot!.querySelector('[data-cy="route-card-sync-badge"]');
    expect(badge?.getAttribute('data-sync-state')).toBe('local');
    document.body.removeChild(list);
  });

  it('con sesión activa, una ruta ya subida se marca "Sincronizada" (sin duplicar la tarjeta)', async () => {
    const saved = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: saved.id, createdAt: saved.createdAt, duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);

    const { list } = await createListWithSession();
    const root = list.shadowRoot!;

    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('[data-cy="route-card-sync-badge"]')?.getAttribute('data-sync-state')).toBe('synced');
    document.body.removeChild(list);
  });

  it('con sesión activa, una ruta exclusiva de la nube aparece marcada "En la nube" y sin botón de eliminar', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'cloud-only', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);

    const { list } = await createListWithSession();
    const root = list.shadowRoot!;
    const card = root.querySelector('.route-card')!;

    expect(card.querySelector('[data-cy="route-card-sync-badge"]')?.getAttribute('data-sync-state')).toBe('cloud-only');
    expect(card.querySelector('[data-cy="route-card-btn-eliminar"]')).toBeNull();
    document.body.removeChild(list);
  });

  it('con sesión activa pero sin conexión a la nube, muestra las rutas locales sin bloquearse (marcadas "Solo local", sin ninguna ruta cloud-only)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockRejectedValue(new Error('network down'));

    const { list } = await createListWithSession();
    const root = list.shadowRoot!;

    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('[data-cy="route-card-sync-badge"]')?.getAttribute('data-sync-state')).toBe('local');
    document.body.removeChild(list);
  });

  it('la miniatura de una ruta exclusiva de la nube con puntos GPS sustituye el placeholder por el trazado real (spec route-cloud-sync)', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'cloud-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);
    vi.mocked(fetchCloudRouteDetail).mockResolvedValue({
      id: 'cloud-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20,
      status: 'completed', name: null, notes: null, isFavorite: false,
      points: [
        { timestamp: 1000, lat: 10, lng: 20, alt: 0, speed: 0 },
        { timestamp: 2000, lat: 11, lng: 21, alt: 0, speed: 0 },
      ],
      stops: [],
    });

    const { list } = await createListWithSession();
    await waitRender();
    const thumb = list.shadowRoot!.querySelector('.thumb')!;

    expect(fetchCloudRouteDetail).toHaveBeenCalledWith('http://localhost:8080', 'jwt-token', 'cloud-1');
    expect(thumb.classList.contains('media-placeholder')).toBe(false);
    expect(thumb.querySelector('svg path[data-cy="route-card-trace"]')).not.toBeNull();
    document.body.removeChild(list);
  });

  it('una ruta exclusiva de la nube sin puntos GPS se queda con el placeholder, sin error (spec route-cloud-sync)', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'cloud-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);
    vi.mocked(fetchCloudRouteDetail).mockResolvedValue({
      id: 'cloud-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20,
      status: 'completed', name: null, notes: null, isFavorite: false, points: [], stops: [],
    });

    const { list } = await createListWithSession();
    await waitRender();
    const thumb = list.shadowRoot!.querySelector('.thumb')!;

    expect(thumb.classList.contains('media-placeholder')).toBe(true);
    document.body.removeChild(list);
  });

  it('un fallo al descargar los puntos de una ruta cloud-only deja esa tarjeta en el placeholder sin afectar al resto del listado (spec route-cloud-sync)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'cloud-1', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);
    vi.mocked(fetchCloudRouteDetail).mockRejectedValue(new Error('network down'));

    const { list } = await createListWithSession();
    await waitRender();
    const root = list.shadowRoot!;

    expect(root.querySelectorAll('.route-card')).toHaveLength(2);
    for (const thumb of root.querySelectorAll('.thumb')) {
      expect(thumb.classList.contains('media-placeholder')).toBe(true);
    }
    document.body.removeChild(list);
  });
});

describe('route-list - favorito por card', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
    vi.clearAllMocks();
  });

  function favoriteIcon(list: HTMLElement): HTMLElement {
    return list.shadowRoot!.querySelector('[data-cy="route-card-btn-favorito"]') as HTMLElement;
  }

  async function mountWithSession(sessionRepository: ISessionRepository): Promise<HTMLElement> {
    const list = document.createElement('route-list') as HTMLElement & {
      repository: IRouteRepository;
      sessionRepository: ISessionRepository;
    };
    list.sessionRepository = sessionRepository;
    list.repository = repo;
    document.body.appendChild(list);
    await waitRender();
    return list;
  }

  it('sin sesión activa, el indicador se muestra (localizable) pero sin acción táctil', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    const list = await createList(repo);

    const icon = favoriteIcon(list);
    expect(icon).not.toBeNull();
    expect(icon.tagName).toBe('SPAN');
    document.body.removeChild(list);
  });

  it('con sesión activa, marca la ruta como favorita al pulsar el icono, sin navegar al detalle', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });

    const list = await mountWithSession(sessionRepository);
    const viewHandler = vi.fn();
    window.addEventListener('view-route', viewHandler);

    const icon = favoriteIcon(list);
    expect(icon.tagName).toBe('BUTTON');
    icon.click();
    await waitRender();

    expect(favoriteIcon(list).classList.contains('favorite-icon--active')).toBe(true);
    expect(viewHandler).not.toHaveBeenCalled();
    window.removeEventListener('view-route', viewHandler);
    document.body.removeChild(list);
  });

  it('con sesión activa, desmarcar una ruta ya favorita la devuelve al estado normal', async () => {
    const saved = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    await repo.updateFavorite(saved.id, true);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });

    const list = await mountWithSession(sessionRepository);
    expect(favoriteIcon(list).classList.contains('favorite-icon--active')).toBe(true);

    favoriteIcon(list).click();
    await waitRender();

    expect(favoriteIcon(list).classList.contains('favorite-icon--active')).toBe(false);
    document.body.removeChild(list);
  });

  it('marcar favorita una ruta ya sincronizada dispara la re-subida en segundo plano (isSynced: true)', async () => {
    const saved = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: saved.id, createdAt: saved.createdAt, duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', name: null, notes: null, isFavorite: false },
    ]);
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });

    const list = await mountWithSession(sessionRepository);
    favoriteIcon(list).click();
    await waitRender();

    expect(autoResyncIfNeeded).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'http://localhost:8080',
      session: { token: 'jwt-token', email: 'rider@example.com' },
      repository: repo,
      isSynced: true,
    }));
    document.body.removeChild(list);
  });

  it('marcar favorita una ruta puramente local no dispara ninguna subida real (isSynced: false)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });

    const list = await mountWithSession(sessionRepository);
    favoriteIcon(list).click();
    await waitRender();

    expect(autoResyncIfNeeded).toHaveBeenCalledWith(expect.objectContaining({ isSynced: false }));
    document.body.removeChild(list);
  });
});

describe('route-list - filtro "Solo favoritas"', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  function filterToggle(list: HTMLElement): HTMLButtonElement {
    return list.shadowRoot!.querySelector('[data-cy="route-list-filtro-favoritas"]') as HTMLButtonElement;
  }

  it('no muestra el filtro cuando no hay ninguna ruta', async () => {
    const list = await createList(repo);
    expect(filterToggle(list)).toBeNull();
    document.body.removeChild(list);
  });

  it('activar el filtro oculta las rutas no favoritas', async () => {
    const favorite = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Favorita' }, [], []);
    await repo.updateFavorite(favorite.id, true);
    await repo.save({ duration: 200, totalDistance: 20, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Normal' }, [], []);

    const list = await createList(repo);
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(2);

    filterToggle(list).click();
    await waitRender();

    const root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('.name')?.textContent).toBe('Favorita');
    document.body.removeChild(list);
  });

  it('muestra un estado vacío dedicado cuando no hay ninguna favorita con el filtro activo', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);

    const list = await createList(repo);
    filterToggle(list).click();
    await waitRender();

    expect(list.shadowRoot!.querySelector('[data-cy="route-list-empty-favoritas"]')).not.toBeNull();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(0);
    document.body.removeChild(list);
  });

  it('desactivar el filtro restaura el listado completo', async () => {
    const favorite = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    await repo.updateFavorite(favorite.id, true);
    await repo.save({ duration: 200, totalDistance: 20, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);

    const list = await createList(repo);
    filterToggle(list).click();
    await waitRender();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(1);

    filterToggle(list).click();
    await waitRender();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(2);
    document.body.removeChild(list);
  });
});

describe('route-list - filtros "Solo locales" / "Solo en la nube"', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
    vi.clearAllMocks();
  });

  async function createListWithSession(): Promise<HTMLElement> {
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });
    const list = document.createElement('route-list') as HTMLElement & {
      repository: IRouteRepository;
      sessionRepository: ISessionRepository;
    };
    list.sessionRepository = sessionRepository;
    list.repository = repo;
    document.body.appendChild(list);
    await waitRender();
    return list;
  }

  function localFilter(list: HTMLElement): HTMLButtonElement {
    return list.shadowRoot!.querySelector('[data-cy="route-list-filtro-locales"]') as HTMLButtonElement;
  }

  function cloudFilter(list: HTMLElement): HTMLButtonElement {
    return list.shadowRoot!.querySelector('[data-cy="route-list-filtro-nube"]') as HTMLButtonElement;
  }

  it('sin sesión activa, no se muestran los filtros de local/nube', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    const list = await createList(repo);

    expect(localFilter(list)).toBeNull();
    expect(cloudFilter(list)).toBeNull();
    document.body.removeChild(list);
  });

  it('activar "Solo locales" oculta las rutas sincronizadas y las exclusivas de la nube', async () => {
    const local = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Local' }, [], []);
    const synced = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Sincronizada' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: synced.id, createdAt: synced.createdAt, duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', name: 'Sincronizada', notes: null, isFavorite: false },
      { id: 'cloud-only', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: 'Solo nube', notes: null, isFavorite: false },
    ]);

    const list = await createListWithSession();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(3);

    localFilter(list).click();
    await waitRender();

    const root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('.name')?.textContent).toBe(local.name);
    document.body.removeChild(list);
  });

  it('activar "Solo en la nube" oculta las rutas puramente locales', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([
      { id: 'cloud-only', createdAt: '2026-08-01T10:00:00.000Z', duration: 60, totalDistance: 5, avgSpeed: 20, status: 'completed', name: 'Solo nube', notes: null, isFavorite: false },
    ]);

    const list = await createListWithSession();
    cloudFilter(list).click();
    await waitRender();

    const root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('.name')?.textContent).toBe('Solo nube');
    document.body.removeChild(list);
  });

  it('activar ambos filtros a la vez no deja ninguna ruta visible (estado vacío genérico, no el de favoritas)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local' }, [], []);
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);

    const list = await createListWithSession();
    localFilter(list).click();
    cloudFilter(list).click();
    await waitRender();

    const root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card')).toHaveLength(0);
    expect(root.querySelector('[data-cy="route-list-empty-favoritas"]')).toBeNull();
    expect(root.querySelector('[data-cy="route-list-empty-filtrado"]')).not.toBeNull();
    document.body.removeChild(list);
  });
});

describe('route-list - buscador por nombre', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  function searchInput(list: HTMLElement): HTMLInputElement {
    return list.shadowRoot!.querySelector('[data-cy="route-list-buscador"]') as HTMLInputElement;
  }

  it('no se muestra cuando no hay ninguna ruta', async () => {
    const list = await createList(repo);
    expect(searchInput(list)).toBeNull();
    document.body.removeChild(list);
  });

  it('escribir en el buscador filtra el listado en vivo, sin distinguir mayúsculas', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Ruta a Málaga' }, [], []);
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Otra ruta' }, [], []);

    const list = await createList(repo);
    const input = searchInput(list);
    input.value = 'málaga';
    input.dispatchEvent(new Event('input'));
    await waitRender();

    const root = list.shadowRoot!;
    expect(root.querySelectorAll('.route-card')).toHaveLength(1);
    expect(root.querySelector('.name')?.textContent).toBe('Ruta a Málaga');
    document.body.removeChild(list);
  });

  it('no perder el foco del input al escribir varios caracteres seguidos (no se reconstruye el DOM del input)', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Ruta de prueba' }, [], []);

    const list = await createList(repo);
    const input = searchInput(list);
    input.focus();

    for (const char of ['r', 'u', 't', 'a']) {
      input.value += char;
      input.dispatchEvent(new Event('input'));
      await waitRender();
    }

    expect(list.shadowRoot!.activeElement).toBe(searchInput(list));
    expect(searchInput(list)).toBe(input);
    document.body.removeChild(list);
  });

  it('una búsqueda sin coincidencias muestra el estado vacío genérico', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Ruta al norte' }, [], []);

    const list = await createList(repo);
    const input = searchInput(list);
    input.value = 'inexistente';
    input.dispatchEvent(new Event('input'));
    await waitRender();

    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(0);
    expect(list.shadowRoot!.querySelector('[data-cy="route-list-empty-filtrado"]')).not.toBeNull();
    document.body.removeChild(list);
  });

  it('vaciar el buscador restaura el listado completo', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Zeta' }, [], []);
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Kilo' }, [], []);

    const list = await createList(repo);
    const input = searchInput(list);
    input.value = 'zeta';
    input.dispatchEvent(new Event('input'));
    await waitRender();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(1);

    searchInput(list).value = '';
    searchInput(list).dispatchEvent(new Event('input'));
    await waitRender();
    expect(list.shadowRoot!.querySelectorAll('.route-card')).toHaveLength(2);
    document.body.removeChild(list);
  });
});

describe('route-list - orden fecha/nombre', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
  });

  function sortToggle(list: HTMLElement): HTMLButtonElement {
    return list.shadowRoot!.querySelector('[data-cy="route-list-orden"]') as HTMLButtonElement;
  }

  it('por defecto ordena por fecha, de más reciente a más antigua', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Vieja', createdAt: '2026-01-01T10:00:00.000Z' } as never, [], []);
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Nueva', createdAt: '2026-02-01T10:00:00.000Z' } as never, [], []);

    const list = await createList(repo);
    const names = Array.from(list.shadowRoot!.querySelectorAll('.name')).map((n) => n.textContent);
    expect(names).toEqual(['Nueva', 'Vieja']);
    document.body.removeChild(list);
  });

  it('cambiar a orden por nombre reordena alfabéticamente de la A a la Z', async () => {
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Zeta' }, [], []);
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Alfa' }, [], []);

    const list = await createList(repo);
    sortToggle(list).click();
    await waitRender();

    const names = Array.from(list.shadowRoot!.querySelectorAll('.name')).map((n) => n.textContent);
    expect(names).toEqual(['Alfa', 'Zeta']);
    document.body.removeChild(list);
  });

  it('el orden se aplica sobre el resultado ya filtrado, no sobre el listado completo', async () => {
    const fav = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Zeta favorita' }, [], []);
    await repo.updateFavorite(fav.id, true);
    const favB = await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'Alfa favorita' }, [], []);
    await repo.updateFavorite(favB.id, true);
    await repo.save({ duration: 100, totalDistance: 10, avgSpeed: 50, status: 'completed', visibility: 'private', origin: 'local', name: 'AAA no favorita' }, [], []);

    const list = await createList(repo);
    const root = list.shadowRoot!;
    root.querySelector<HTMLButtonElement>('[data-cy="route-list-filtro-favoritas"]')!.click();
    await waitRender();
    sortToggle(list).click();
    await waitRender();

    const names = Array.from(root.querySelectorAll('.name')).map((n) => n.textContent);
    expect(names).toEqual(['Alfa favorita', 'Zeta favorita']);
    document.body.removeChild(list);
  });
});

describe('route-list - badge numérico de invitaciones pendientes', () => {
  let repo: IRouteRepository;

  beforeEach(() => {
    repo = new MemoryRouteRepository();
    vi.clearAllMocks();
  });

  async function createListWithSession(): Promise<HTMLElement> {
    const sessionRepository = new MemorySessionRepository();
    await sessionRepository.save({ token: 'jwt-token', email: 'rider@example.com' });
    const list = document.createElement('route-list') as HTMLElement & {
      repository: IRouteRepository;
      sessionRepository: ISessionRepository;
    };
    list.sessionRepository = sessionRepository;
    list.repository = repo;
    document.body.appendChild(list);
    await waitRender();
    return list;
  }

  it('muestra el número real de invitaciones pendientes en el botón de invitaciones', async () => {
    vi.mocked(fetchCloudRoutes).mockResolvedValue([]);
    vi.mocked(fetchReceivedInvitations).mockResolvedValue([
      { id: 'inv-1', routeId: 'route-1', routeName: null, routeCreatedAt: '2026-08-14T10:00:00.000Z', fromEmail: 'a@example.com', createdAt: '2026-08-14T10:00:00.000Z' },
      { id: 'inv-2', routeId: 'route-2', routeName: null, routeCreatedAt: '2026-08-14T10:00:00.000Z', fromEmail: 'b@example.com', createdAt: '2026-08-14T10:00:00.000Z' },
    ]);

    const list = await createListWithSession();
    const badge = list.shadowRoot!.querySelector('[data-cy="route-list-invitaciones-badge"]');

    expect(badge?.textContent).toBe('2');
    document.body.removeChild(list);
  });
});