import { fetchJson, ExternalApiError } from './external-api.service.js';

/**
 * Causa de un fallo al llamar a los endpoints de `/api/routes/{id}/photos`.
 * Mapeado desde el status HTTP de la respuesta, mismo criterio que `RouteCloudApiErrorKind`.
 */
export type PhotoCloudApiErrorKind = 'unauthorized' | 'too-large' | 'too-many-photos' | 'not-found' | 'network' | 'unknown';

/** Error tipado para fallos de los endpoints de fotos de ruta en la nube. */
export class PhotoCloudApiError extends Error {
  constructor(
    public readonly kind: PhotoCloudApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PhotoCloudApiError';
  }
}

interface ApiErrorBody {
  error?: string;
}

function toPhotoCloudApiError(err: unknown): PhotoCloudApiError {
  if (err instanceof ExternalApiError) {
    if (err.kind === 'http-error' && err.status !== undefined) {
      const message = (err.body as ApiErrorBody | undefined)?.error ?? err.message;
      return new PhotoCloudApiError(mapStatus(err.status, message), message);
    }
    if (err.kind === 'network' || err.kind === 'timeout') {
      return new PhotoCloudApiError('network', err.message);
    }
  }
  return new PhotoCloudApiError('unknown', err instanceof Error ? err.message : String(err));
}

/**
 * El backend usa el mismo status 400 tanto para "foto demasiado grande" como
 * para "la ruta ya alcanzó el límite de fotos" -- se distingue por el mensaje
 * (ver apps/api/internal/photos/photos.go, ErrPhotoTooLarge/ErrTooManyPhotos).
 */
function mapStatus(status: number, message: string): PhotoCloudApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not-found';
  if (status === 400) {
    if (message.includes('maximum number of photos')) return 'too-many-photos';
    if (message.includes('maximum allowed size')) return 'too-large';
  }
  return 'unknown';
}

/** Datos de una foto local a subir al backend. */
export interface UploadRoutePhotoParams {
  file: Blob;
  filename: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
}

/** Metadatos remotos devueltos por el backend tras subir una foto. */
export interface UploadedRoutePhoto {
  id: string;
}

function buildPhotoFormData(params: UploadRoutePhotoParams): FormData {
  const formData = new FormData();
  formData.append('photo', params.file, params.filename);
  if (params.latitude !== null) formData.append('latitude', String(params.latitude));
  if (params.longitude !== null) formData.append('longitude', String(params.longitude));
  formData.append('captured_at', params.capturedAt);
  return formData;
}

/**
 * `POST /api/routes/{id}/photos` -- sube una foto nueva a una ruta de la
 * cuenta del usuario autenticado. El servidor cifra los bytes antes de
 * guardarlos; aquí solo se envían en claro sobre la conexión ya autenticada.
 */
export async function uploadRoutePhoto(
  apiBaseUrl: string,
  token: string,
  routeId: string,
  params: UploadRoutePhotoParams,
): Promise<UploadedRoutePhoto> {
  try {
    const response = await fetchJson<UploadedRoutePhoto>(`${apiBaseUrl}/api/routes/${routeId}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      checkStatus: true,
      body: buildPhotoFormData(params),
    });
    return { id: response.id };
  } catch (err) {
    throw toPhotoCloudApiError(err);
  }
}

/**
 * `DELETE /api/routes/{id}/photos/{photoId}` -- borra la copia remota de una
 * foto de una ruta de la cuenta del usuario autenticado.
 */
export async function deleteRoutePhoto(apiBaseUrl: string, token: string, routeId: string, remotePhotoId: string): Promise<void> {
  try {
    await fetchJson(`${apiBaseUrl}/api/routes/${routeId}/photos/${remotePhotoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      checkStatus: true,
    });
  } catch (err) {
    throw toPhotoCloudApiError(err);
  }
}

/** Metadatos de una foto de ruta devueltos por `GET /api/routes/{id}/photos`, sin sus bytes. */
export interface CloudPhotoSummary {
  id: string;
  mimeType: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  createdAt: string;
}

interface CloudPhotoSummaryResponse {
  id: string;
  route_id: string;
  mime_type: string;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  created_at: string;
}

function toCloudPhotoSummary(r: CloudPhotoSummaryResponse): CloudPhotoSummary {
  return {
    id: r.id,
    mimeType: r.mime_type,
    latitude: r.latitude,
    longitude: r.longitude,
    capturedAt: r.captured_at,
    createdAt: r.created_at,
  };
}

/**
 * `GET /api/routes/{id}/photos` -- metadatos (sin bytes) de las fotos de una
 * ruta de la cuenta del usuario autenticado.
 */
export async function listRoutePhotos(apiBaseUrl: string, token: string, routeId: string): Promise<CloudPhotoSummary[]> {
  try {
    const response = await fetchJson<CloudPhotoSummaryResponse[]>(`${apiBaseUrl}/api/routes/${routeId}/photos`, {
      headers: { Authorization: `Bearer ${token}` },
      checkStatus: true,
    });
    return response.map(toCloudPhotoSummary);
  } catch (err) {
    throw toPhotoCloudApiError(err);
  }
}

/**
 * `GET /api/routes/{id}/photos/{photoId}` -- descarga los bytes ya
 * descifrados de una foto de una ruta de la cuenta del usuario autenticado.
 * No usa `fetchJson`: la respuesta es la imagen binaria, no JSON.
 */
export async function downloadRoutePhoto(apiBaseUrl: string, token: string, routeId: string, photoId: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/routes/${routeId}/photos/${photoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new PhotoCloudApiError('network', `Network error downloading photo ${photoId} of route ${routeId}: ${String(err)}`);
  }

  if (!response.ok) {
    let message = `Photo download failed with status ${String(response.status)}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) message = body.error;
    } catch {
      // cuerpo de error no-JSON o vacío — se mantiene el mensaje genérico
    }
    throw new PhotoCloudApiError(mapStatus(response.status, message), message);
  }

  return response.blob();
}
