import type { IRouteRepository } from '../../shared/models/route.repository.js';
import type { Route } from '../../shared/models/route.types.js';
import type { Session } from '../../shared/models/session.types.js';
import { simplifyPolyline } from '../../shared/services/route-polyline.service.js';
import { fetchCloudRouteDetail } from '../../shared/http/route-cloud-api.service.js';

/**
 * Único punto de decisión de "¿ya tiene trazado / hay que calcularlo / no hay
 * datos disponibles?" para el backfill perezoso del listado de rutas —
 * `route-list.element.ts` no debe reimplementar esta lógica de guarda.
 *
 * - Si `route.previewPolyline` ya está calculado (no es `null`, aunque esté
 *   vacío), se devuelve tal cual sin volver a pedir puntos ni recalcular.
 * - Si no, se piden los `route_points` y, si existen, se simplifica el
 *   trazado y se persiste en segundo plano vía `updatePreviewPolyline`.
 * - Si la ruta no tiene ningún `route_point`, devuelve `null` sin lanzar y
 *   sin persistir nada (caso AC-024).
 */
export async function ensurePreviewPolyline(
  repository: IRouteRepository,
  route: Route,
): Promise<[number, number][] | null> {
  if (route.previewPolyline !== null) {
    return route.previewPolyline;
  }

  const points = await repository.getPointsByRouteId(route.id);
  if (points.length === 0) return null;

  const polyline = simplifyPolyline(points);
  await repository.updatePreviewPolyline(route.id, polyline);
  return polyline;
}

/**
 * Igual que {@link ensurePreviewPolyline}, pero para una ruta exclusiva de la
 * nube (`syncState === 'cloud-only'`): descarga sus puntos vía
 * `GET /api/routes/{id}` (`fetchCloudRouteDetail`, mismo endpoint que ya usa
 * el detalle) en vez de leer `IRouteRepository` local, que nunca tiene filas
 * para esta ruta. Sin persistencia — la ruta no tiene fila local en la que
 * guardar el resultado, se recalcula en cada apertura del listado (ver
 * design.md, Non-Goals). Nunca lanza: un fallo de red o una ruta sin puntos
 * devuelven `null`, dejando la tarjeta en el placeholder.
 */
export async function ensureCloudPreviewPolyline(
  apiBaseUrl: string,
  session: Session,
  route: Route,
): Promise<[number, number][] | null> {
  if (route.previewPolyline !== null) {
    return route.previewPolyline;
  }

  try {
    const detail = await fetchCloudRouteDetail(apiBaseUrl, session.token, route.id);
    if (detail.points.length === 0) return null;
    return simplifyPolyline(detail.points);
  } catch {
    return null;
  }
}
