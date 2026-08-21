import type { IRouteRepository } from '../../shared/models/route.repository.js';
import type { Route, RoutePoint, RouteStop } from '../../shared/models/route.types.js';
import type { Session } from '../../shared/models/session.types.js';
import type { IPhotoRepository } from '../../shared/models/photo.repository.js';
import type { Photo } from '../../shared/models/photo.types.js';
import { uploadRoute, fetchCloudRouteDetail, fetchCloudRoutes, type UploadedRoutePoint } from '../../shared/http/route-cloud-api.service.js';
import { uploadRoutePhoto, deleteRoutePhoto, listRoutePhotos, downloadRoutePhoto } from '../../shared/http/photo-cloud-api.service.js';
import { checkAchievements } from '../../shared/http/achievement-api.service.js';
import { readPhotoBlob } from '../../shared/services/photo-storage.service.js';
import { toErrorMessage } from '../../shared/utils/errors.js';
import { showToast } from '../../shared/feedback/toast.js';
import { enqueueAchievementUnlock } from '../../shared/feedback/achievement-unlock-overlay.element.js';
import { cloudRouteDetailToLocal } from './route-detail-cloud.transform.js';
import type { PhotoWithUrl } from './route-detail.types.js';

/**
 * Comprueba si la sincronización que acaba de terminar desbloqueó algún
 * logro nuevo y, si es así, lo encola para su animación — fire-and-forget,
 * nunca afecta al resultado ya confirmado de la subida (ver design.md
 * Decisión 7 de sistema-logros: único punto de "ruta recién sincronizada"
 * del cliente, cubre tanto la subida manual como el auto-resync).
 */
function checkAchievementsAfterSync(apiBaseUrl: string, session: Session): void {
  checkAchievements(apiBaseUrl, session.token)
    .then((granted) => {
      granted.forEach((achievement) => {
        enqueueAchievementUnlock(achievement);
      });
    })
    .catch(() => {
      // Sin aviso al usuario: un logro no reconocido ahora se detecta en la
      // siguiente sincronización (ver spec "Fallo al comprobar logros no
      // bloquea la sincronización").
    });
}

/**
 * Sube (o actualiza, upsert por id) una ruta local completa a la cuenta del
 * usuario autenticado — sus puntos y paradas se leen del repositorio local
 * en el momento de subir, no se guardan aparte. Devuelve los puntos
 * resultantes que el servidor guardó (ajustados a carretera si se
 * normalizaron), para que el llamador pueda repintar el mapa sin una
 * segunda petición.
 */
export async function uploadRouteToCloud(
  apiBaseUrl: string,
  session: Session,
  repository: IRouteRepository,
  route: Route,
): Promise<UploadedRoutePoint[]> {
  const [points, stops] = await Promise.all([
    repository.getPointsByRouteId(route.id),
    repository.getStopsByRouteId(route.id),
  ]);
  const uploaded = await uploadRoute(apiBaseUrl, session.token, { route, points, stops });
  checkAchievementsAfterSync(apiBaseUrl, session);
  return uploaded;
}

/** Parámetros de {@link autoResyncIfNeeded}, agrupados por `max-params`. */
export interface AutoResyncOptions {
  apiBaseUrl: string;
  session: Session;
  repository: IRouteRepository;
  route: Route;
  isSynced: boolean;
}

/**
 * Re-sube en segundo plano una ruta que ya estaba sincronizada tras un
 * cambio local (nota o foto) — sin acción explícita del usuario. Sin toast
 * de éxito (para no ser ruidoso en una acción secundaria que el usuario no
 * ha pedido), pero con un aviso discreto si falla; nunca revierte el cambio
 * local ya guardado (ver design.md Decisión 10 / spec `route-cloud-sync`).
 * No hace nada si la ruta todavía no estaba sincronizada — esta función
 * nunca sube una ruta puramente local por primera vez.
 */
export async function autoResyncIfNeeded(options: AutoResyncOptions): Promise<void> {
  if (!options.isSynced) return;
  try {
    await uploadRouteToCloud(options.apiBaseUrl, options.session, options.repository, options.route);
  } catch (err) {
    showToast(toErrorMessage(err, 'No se pudo actualizar la ruta en la nube'), 'error');
  }
}

/**
 * Comprueba si una ruta local ya existe también en la cuenta del usuario —
 * `IRouteRepository` no guarda ningún estado de sincronización propio, así
 * que se consulta el resumen real de la nube (mismo criterio que usa el
 * listado para fusionar). Nunca lanza: un fallo de red se trata como "no
 * sincronizada" — degradación segura, ver design.md Decisión 8.
 */
export async function checkIfRouteIsSynced(apiBaseUrl: string, session: Session, routeId: string): Promise<boolean> {
  try {
    const cloud = await fetchCloudRoutes(apiBaseUrl, session.token);
    return cloud.some((r) => r.id === routeId);
  } catch {
    return false;
  }
}

/** Ruta descargada de la nube, adaptada a los tipos locales. */
export interface CloudRouteLoaded {
  route: Route;
  points: RoutePoint[];
  stops: RouteStop[];
  error?: undefined;
}

/** Fallo al descargar el detalle (p. ej. sin conexión). */
export interface CloudRouteLoadFailed {
  error: string;
}

/**
 * Descarga el detalle completo de una ruta exclusiva de la nube (no existe
 * en el repositorio local) para renderizarla con el mismo mapa/timeline que
 * una ruta local. Nunca lanza: un fallo (red, 404) se devuelve como
 * `CloudRouteLoadFailed` para que el llamador muestre un mensaje explícito
 * en vez de dejar la pantalla en blanco.
 */
export async function loadCloudRouteDetail(
  apiBaseUrl: string,
  session: Session,
  routeId: string,
): Promise<CloudRouteLoaded | CloudRouteLoadFailed> {
  try {
    const detail = await fetchCloudRouteDetail(apiBaseUrl, session.token, routeId);
    return cloudRouteDetailToLocal(detail);
  } catch (err) {
    return { error: toErrorMessage(err, 'Error al cargar la ruta de la nube') };
  }
}

/** Parámetros de {@link uploadPhotoToCloud}, agrupados por `max-params`. */
export interface UploadPhotoToCloudOptions {
  apiBaseUrl: string;
  session: Session;
  photoRepo: IPhotoRepository;
  routeId: string;
  photo: Photo;
  isSynced: boolean;
}

/**
 * Sube en segundo plano el archivo de una foto recién añadida a una ruta ya
 * sincronizada, y marca su id remoto en el repositorio local para que un
 * borrado posterior pueda referenciarla (ver design.md Decisión 5). No hace
 * nada si la ruta no está sincronizada. Nunca lanza: un fallo (sin conexión,
 * límite del servidor) se queda como "no sincronizada" con un aviso
 * discreto, sin revertir el guardado local ya confirmado.
 */
export async function uploadPhotoToCloud(options: UploadPhotoToCloudOptions): Promise<void> {
  if (!options.isSynced) return;
  try {
    const blob = await readPhotoBlob(options.photo.filePath);
    const filename = options.photo.filePath.split('/').pop() ?? `${options.photo.id}.jpg`;
    const uploaded = await uploadRoutePhoto(options.apiBaseUrl, options.session.token, options.routeId, {
      file: blob,
      filename,
      latitude: options.photo.latitude,
      longitude: options.photo.longitude,
      capturedAt: options.photo.capturedAt,
    });
    await options.photoRepo.markPhotoSynced(options.photo.id, uploaded.id);
  } catch (err) {
    showToast(toErrorMessage(err, 'No se pudo subir la foto a la nube'), 'error');
  }
}

/** Parámetros de {@link deletePhotoFromCloud}, agrupados por `max-params`. */
export interface DeletePhotoFromCloudOptions {
  apiBaseUrl: string;
  session: Session;
  routeId: string;
  remotePhotoId: string | null;
  isSynced: boolean;
}

/**
 * Borra en segundo plano la copia remota de una foto borrada localmente de
 * una ruta ya sincronizada. No hace ninguna llamada de red si la ruta no
 * está sincronizada o la foto nunca llegó a subirse (`remotePhotoId` nulo).
 * Nunca lanza: un fallo se queda con un aviso discreto, sin afectar al
 * borrado local (que ya ha tenido éxito).
 */
export async function deletePhotoFromCloud(options: DeletePhotoFromCloudOptions): Promise<void> {
  if (!options.isSynced || options.remotePhotoId === null) return;
  try {
    await deleteRoutePhoto(options.apiBaseUrl, options.session.token, options.routeId, options.remotePhotoId);
  } catch (err) {
    showToast(toErrorMessage(err, 'No se pudo borrar la foto de la nube'), 'error');
  }
}

/** Resultado de {@link loadCloudRoutePhotos}: siempre resuelve, nunca lanza. */
export interface CloudPhotosLoaded {
  photos: PhotoWithUrl[];
  /** Mensaje de fallo al listar o descargar, o `null` si todo fue bien. */
  error: string | null;
}

/**
 * Descarga las fotos de una ruta exclusiva de la nube (metadatos vía
 * `GET /api/routes/{id}/photos`, bytes de cada una en paralelo vía
 * `GET /api/routes/{id}/photos/{photoId}`), devolviendo `PhotoWithUrl[]` con
 * `objectUrl` ya resuelto para mostrarlas en la misma galería/timeline que
 * una ruta local. `filePath` se rellena con un valor sintético inerte
 * (`cloud:${photoId}`) — esta foto no tiene fichero local, y ese campo solo
 * se usa hoy para rutas locales (ver design.md, Decisión 2). Nunca lanza: un
 * fallo al listar o al descargar cualquier foto se resuelve como lista vacía
 * con un mensaje de error, para que el llamador muestre un aviso discreto sin
 * bloquear el resto del detalle (ver design.md, Decisión 1).
 */
export async function loadCloudRoutePhotos(apiBaseUrl: string, session: Session, routeId: string): Promise<CloudPhotosLoaded> {
  try {
    const summaries = await listRoutePhotos(apiBaseUrl, session.token, routeId);
    const photos = await Promise.all(summaries.map(async (summary): Promise<PhotoWithUrl> => {
      const blob = await downloadRoutePhoto(apiBaseUrl, session.token, routeId, summary.id);
      return {
        id: summary.id,
        routeId,
        filePath: `cloud:${summary.id}`,
        latitude: summary.latitude,
        longitude: summary.longitude,
        capturedAt: summary.capturedAt,
        createdAt: summary.createdAt,
        remotePhotoId: summary.id,
        objectUrl: URL.createObjectURL(blob),
      };
    }));
    return { photos, error: null };
  } catch (err) {
    return { photos: [], error: toErrorMessage(err, 'Error al cargar las fotos de la ruta') };
  }
}
