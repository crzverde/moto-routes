import styles from './route-list.element.css?inline';
import type { IRouteRepository } from '../../shared/models/route.repository.js';
import type { IPhotoRepository } from '../../shared/models/photo.repository.js';
import type { ISessionRepository } from '../../shared/models/session.repository.js';
import type { Session } from '../../shared/models/session.types.js';
import type { Route } from '../../shared/models/route.types.js';
import { getApiBaseUrl } from '../../shared/http/api-config.js';
import { formatDuration } from '../../shared/utils/format.js';
import { formatRouteDate } from '../../shared/utils/date.js';
import { buildRouteDisplayName } from '../../shared/utils/route-naming.js';
import { BaseElement } from '../../shared/base-element.js';
import { APP_EVENTS, dispatchAppEvent } from '../../shared/app-events.js';
import { createPhotoRepository } from '../../shared/services/photo-storage.service.js';
import { deleteRouteAndPhotos } from '../../shared/services/route-deletion.service.js';
import { confirmDialog } from '../../shared/feedback/confirm-dialog.element.js';
import { showToast } from '../../shared/feedback/toast.js';
import { toErrorMessage } from '../../shared/utils/errors.js';
import { loadRouteListItems } from './route-list-sync.service.js';
import type { RouteListItem, RouteSyncState } from './route-list-sync.transform.js';
import { DEVICE_ICON, CLOUD_CHECK_ICON, CLOUD_ONLY_ICON } from '../../shared/icons/cloud-sync-icons.js';
import { TRASH_ICON } from '../../shared/icons/action-icons.js';
import { buildRouteCardFavoriteBadge } from './route-list-favorite.js';
import { hasPendingReceivedInvitations } from './route-list-sharing.js';
import { buildControlsRow, buildSearchSortRow } from './route-list-controls.js';
import { buildListBody } from './route-list-body.js';
import { buildThumb, type CloudBackfillContext } from './route-list-thumb.js';
import type { ListControls, ListSortBy } from './route-list-filters.transform.js';

const SYNC_ICON_BY_STATE: Record<RouteSyncState, string> = {
  local: DEVICE_ICON,
  synced: CLOUD_CHECK_ICON,
  'cloud-only': CLOUD_ONLY_ICON,
};

const SYNC_LABEL_BY_STATE: Record<RouteSyncState, string> = {
  local: 'Solo en este dispositivo',
  synced: 'Sincronizada con la nube',
  'cloud-only': 'Solo en la nube',
};

class RouteList extends BaseElement {
  private _repository: IRouteRepository | null = null;
  private _sessionRepository: ISessionRepository | null = null;
  private _items: RouteListItem[] = [];
  private _hasSession = false;
  private _session: Session | null = null;
  private _loading = false;
  private _showFavoritesOnly = false;
  private _showLocalOnly = false;
  private _showCloudOnly = false;
  private _searchQuery = '';
  private _sortBy: ListSortBy = 'date';
  private _hasPendingShares = 0;
  private photoRepo: IPhotoRepository | null = null;

  private async getPhotoRepo(): Promise<IPhotoRepository> {
    this.photoRepo ??= await createPhotoRepository();
    return this.photoRepo;
  }

  set repository(repo: IRouteRepository | null) {
    this._repository = repo;
    if (repo) void this.fetchAndRender();
  }

  get repository(): IRouteRepository | null {
    return this._repository;
  }

  set sessionRepository(repo: ISessionRepository | null) {
    this._sessionRepository = repo;
  }

  get sessionRepository(): ISessionRepository | null {
    return this._sessionRepository;
  }

  private readonly onNavRutas = (): void => { void this.fetchAndRender(); };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    window.addEventListener(APP_EVENTS.NAV_RUTAS, this.onNavRutas);
    if (this._repository) {
      void this.fetchAndRender();
    }
  }

  disconnectedCallback(): void {
    window.removeEventListener(APP_EVENTS.NAV_RUTAS, this.onNavRutas);
  }

  /**
   * `fetchAndRender` puede dispararse varias veces solapadas (el setter de
   * `repository` y `connectedCallback` ya lo hacían los dos al arrancar la
   * app, antes de que exista sesión; `onNavRutas` añade una más después del
   * login) — sin guardarlas, la más lenta puede resolver la última y
   * sobrescribir con datos obsoletos (p. ej. "sin invitaciones pendientes")
   * el resultado ya correcto de una llamada posterior más rápida. Bug real
   * encontrado en Cypress (condición de carrera, no solo lentitud del test).
   */
  private _fetchToken = 0;

  private async fetchAndRender(): Promise<void> {
    if (!this._repository) return;
    const token = ++this._fetchToken;
    this._loading = true;
    this.render();
    this._session = (await this._sessionRepository?.get()) ?? null;
    const [result, hasPendingShares] = await Promise.all([
      loadRouteListItems(getApiBaseUrl(), this._repository, this._sessionRepository),
      hasPendingReceivedInvitations(getApiBaseUrl(), this._session),
    ]);
    if (token !== this._fetchToken) return;
    this._items = result.items;
    this._hasSession = result.hasSession;
    this._hasPendingShares = hasPendingShares;
    this._loading = false;
    this.render();
  }

  private buildLoadingState(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'route-list__loading';
    el.setAttribute('data-cy', 'route-list-loading');
    el.textContent = 'Cargando rutas…';
    return el;
  }

  protected render(): void {
    const screen = document.createElement('div');
    screen.className = 'route-list';
    if (this._loading) {
      screen.appendChild(this.buildLoadingState());
    } else {
      screen.appendChild(this.buildHeader(this._items));
      screen.appendChild(this.buildBody(this._items));
    }

    this.renderShadow(styles, screen);
  }

  private get listControls(): ListControls {
    return {
      showFavoritesOnly: this._showFavoritesOnly,
      showLocalOnly: this._showLocalOnly,
      showCloudOnly: this._showCloudOnly,
      searchQuery: this._searchQuery,
      sortBy: this._sortBy,
    };
  }

  private buildHeader(items: RouteListItem[]): DocumentFragment {
    const fragment = document.createDocumentFragment();

    const title = document.createElement('h1');
    title.className = 'route-list__title';
    title.textContent = 'Tus rutas';
    fragment.appendChild(title);

    const totalKm = items.reduce((sum, i) => sum + i.route.totalDistance, 0);
    const subtitle = document.createElement('p');
    subtitle.className = 'route-list__subtitle';
    subtitle.textContent = `${String(items.length)} rutas guardadas · ${totalKm.toFixed(1)} km recorridos`;
    fragment.appendChild(subtitle);

    const controlsRow = buildControlsRow({
      hasSession: this._hasSession,
      hasItems: items.length > 0,
      hasPendingShares: this._hasPendingShares,
      showFavoritesOnly: this._showFavoritesOnly,
      showLocalOnly: this._showLocalOnly,
      showCloudOnly: this._showCloudOnly,
      onToggleFavorites: () => { this._showFavoritesOnly = !this._showFavoritesOnly; this.render(); },
      onToggleLocal: () => { this._showLocalOnly = !this._showLocalOnly; this.render(); },
      onToggleCloud: () => { this._showCloudOnly = !this._showCloudOnly; this.render(); },
    });
    if (controlsRow) fragment.appendChild(controlsRow);

    if (items.length > 0) {
      fragment.appendChild(buildSearchSortRow({
        searchQuery: this._searchQuery,
        sortBy: this._sortBy,
        // Actualización parcial (no render() completo): ver JSDoc de
        // updateBodyOnly — un render() completo destruiría y recrearía este
        // <input> en cada tecla, perdiendo el foco. Gap real encontrado
        // implementando, no anticipado en design.md.
        onSearchInput: (value) => { this._searchQuery = value; this.updateBodyOnly(); },
        onToggleSort: () => { this._sortBy = this._sortBy === 'date' ? 'name' : 'date'; this.render(); },
      }));
    }

    return fragment;
  }

  /**
   * Sustituye solo la sección de resultados (tarjetas o estado vacío), sin
   * tocar el resto del Shadow DOM — necesario para que el buscador no pierda
   * el foco en cada tecla (ver `onSearchInput` en `buildHeader`).
   */
  private updateBodyOnly(): void {
    const root = this.shadowRoot;
    if (!root) return;
    const oldBody = root.querySelector('.route-list__cards, .route-list__empty');
    const newBody = this.buildBody(this._items);
    if (oldBody) oldBody.replaceWith(newBody);
  }

  private buildBody(items: RouteListItem[]): HTMLElement {
    return buildListBody(items, this.listControls, (item) => this.buildCard(item));
  }

  private buildCard(item: RouteListItem): HTMLElement {
    const { route } = item;
    const card = document.createElement('div');
    card.className = 'route-card';
    card.setAttribute('data-cy', 'route-card');
    card.dataset.routeId = route.id;
    card.addEventListener('click', () => {
      dispatchAppEvent(APP_EVENTS.VIEW_ROUTE, { routeId: route.id });
    });

    card.appendChild(this.buildThumbWithBadge(item, card));
    card.appendChild(this.buildInfo(item));
    const deleteBtn = this.buildDeleteButton(item);
    if (deleteBtn) card.appendChild(deleteBtn);
    return card;
  }

  /**
   * Envuelve la miniatura en un contenedor relativo con el icono de estado
   * de sincronización superpuesto en su esquina inferior (solo con sesión
   * activa — sin sesión no hay ningún concepto de nube, AC de la spec
   * `route-cloud-sync`) y el de favorito en la esquina superior — mismo
   * patrón que el badge de "sincronizado" de apps como Google Fotos, en vez
   * de una columna de acciones aparte compitiendo con el botón de borrar.
   */
  private buildThumbWithBadge(item: RouteListItem, card: HTMLElement): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-wrapper';
    const cloudContext: CloudBackfillContext | null = this._session
      ? { apiBaseUrl: getApiBaseUrl(), session: this._session }
      : null;
    wrapper.appendChild(buildThumb(item, card, this._repository, cloudContext));
    if (this._repository) {
      wrapper.appendChild(buildRouteCardFavoriteBadge({
        repository: this._repository,
        session: this._session,
        item,
        onToggled: () => { this.render(); },
      }));
    }
    if (this._hasSession) wrapper.appendChild(this.buildSyncIcon(item.syncState));
    return wrapper;
  }

  private buildInfo(item: RouteListItem): HTMLElement {
    const { route } = item;
    const info = document.createElement('div');
    info.className = 'info';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = buildRouteDisplayName(route.name, route.createdAt);
    info.appendChild(name);

    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = formatRouteDate(route.createdAt);
    info.appendChild(date);

    info.appendChild(this.buildBadges(route));
    return info;
  }

  private buildBadges(route: Route): HTMLElement {
    const badges = document.createElement('div');
    badges.className = 'badges';
    badges.innerHTML = `<span class="badge distance">${route.totalDistance.toFixed(1)} km</span><span class="badge duration">${formatDuration(route.duration)}</span>`;
    return badges;
  }

  /** Icono de estado de sincronización, sin texto (ver design.md Decisión 9). */
  private buildSyncIcon(syncState: RouteSyncState): HTMLElement {
    const icon = document.createElement('span');
    icon.className = `sync-status-icon sync-status-icon--${syncState}`;
    icon.setAttribute('data-cy', 'route-card-sync-badge');
    icon.setAttribute('aria-label', SYNC_LABEL_BY_STATE[syncState]);
    icon.dataset.syncState = syncState;
    icon.innerHTML = SYNC_ICON_BY_STATE[syncState];
    return icon;
  }

  /**
   * `null` para una ruta exclusiva de la nube: no hay requisito de negocio
   * para borrarla desde la app (ver design.md, Non-Goals) y, además, no
   * existe fila local que `IRouteRepository.delete()` pudiera afectar.
   */
  private buildDeleteButton(item: RouteListItem): HTMLButtonElement | null {
    if (item.syncState === 'cloud-only') return null;

    const { route } = item;
    const btn = document.createElement('button');
    btn.className = 'route-card__delete';
    btn.setAttribute('data-cy', 'route-card-btn-eliminar');
    btn.setAttribute('aria-label', 'Eliminar ruta');
    btn.innerHTML = TRASH_ICON;
    btn.addEventListener('click', (event) => {
      // La tarjeta entera navega al detalle al pulsarla — evitar que el click
      // de "eliminar" también dispare esa navegación.
      event.stopPropagation();
      void this.handleDeleteRoute(route);
    });
    return btn;
  }

  private async handleDeleteRoute(route: Route): Promise<void> {
    const choice = await confirmDialog({
      title: 'Eliminar ruta',
      message: `Se eliminará esta ruta de ${route.totalDistance.toFixed(1)} km y todas sus fotos. Esta acción no se puede deshacer.`,
      actions: [
        { id: 'cancel', label: 'Cancelar', variant: 'neutral' },
        { id: 'confirm', label: 'Eliminar', variant: 'danger' },
      ],
    });
    if (choice !== 'confirm' || !this._repository) return;

    try {
      const photoRepo = await this.getPhotoRepo();
      await deleteRouteAndPhotos(this._repository, photoRepo, route.id);
    } catch (err) {
      showToast(toErrorMessage(err, 'Error al eliminar la ruta'), 'error');
      return;
    }
    this._items = this._items.filter((i) => i.route.id !== route.id);
    this.render();
    showToast('Ruta eliminada', 'success');
  }
}

customElements.define('route-list', RouteList);