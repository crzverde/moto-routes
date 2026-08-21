/**
 * Panel "Fotos" de <route-detail>: construcción del DOM (botón de captura +
 * galería). Extraído de route-detail.element.ts para mantener ese archivo
 * bajo el límite de tamaño (specs/ui/frontend-conventions.md).
 */
import type { PhotoCaptureElement } from '../../shared/photo-capture/photo-capture.element.js';
import { PHOTO_CAPTURE_EVENT, type PhotoCaptureEventDetail } from '../../shared/photo-capture/photo-capture.types.js';
import { applyPhotoCaptureLimit } from '../../shared/photo-capture/photo-capture.limit.js';
import '../../shared/photo-gallery/photo-gallery.element.js';
import { PHOTO_GALLERY_SELECT_EVENT, type PhotoGallerySelectDetail, type GalleryPhoto, type PhotoGalleryLayout } from '../../shared/photo-gallery/photo-gallery.element.js';
import type { PhotoWithUrl } from './route-detail.types.js';

/** Adapta las fotos ya resueltas (con `objectUrl`) al tipo mínimo que espera `<photo-gallery>`. */
export function toGalleryPhotos(photos: PhotoWithUrl[]): GalleryPhoto[] {
  return photos.map((p) => ({ id: p.id, objectUrl: p.objectUrl }));
}

export interface PhotosPanelCallbacks {
  onAddPhoto: (source: 'camera' | 'gallery') => void;
  onSelectPhoto: (index: number) => void;
}

/** Opciones del panel de fotos, aparte de fotos/callbacks/registro de captura. */
export interface PhotosPanelOptions {
  /** `true` para una ruta exclusiva de la nube: omite el botón de captura,
   * que no tiene ningún repositorio local que respalde añadir una foto. */
  readOnly?: boolean;
}

/** Panel de la pestaña "Fotos" (AC-006). Un `<div slot="fotos">` — no un
 * `DocumentFragment`, que no puede llevar el atributo `slot`. */
export function buildPhotosSection(
  photos: PhotoWithUrl[],
  callbacks: PhotosPanelCallbacks,
  registerCaptureEl: (el: PhotoCaptureElement) => void,
  options?: PhotosPanelOptions,
): HTMLElement {
  const section = document.createElement('div');
  section.setAttribute('slot', 'fotos');

  const photosLabel = document.createElement('div');
  photosLabel.className = 'section-label';
  photosLabel.textContent = 'Fotos de la ruta';
  section.appendChild(photosLabel);

  if (!options?.readOnly) {
    const photoCapture = document.createElement('photo-capture') as PhotoCaptureElement;
    photoCapture.setAttribute('data-cy', 'detail-photo-capture');
    photoCapture.classList.add('detail-photo-capture');
    photoCapture.addEventListener(PHOTO_CAPTURE_EVENT, ((event: CustomEvent<PhotoCaptureEventDetail>) => {
      callbacks.onAddPhoto(event.detail.source);
    }) as EventListener);
    applyPhotoCaptureLimit(photoCapture, photos.length);
    registerCaptureEl(photoCapture);
    section.appendChild(photoCapture);
  }

  const gallery = document.createElement('photo-gallery') as HTMLElement & { photos: GalleryPhoto[]; layout: PhotoGalleryLayout };
  gallery.layout = 'grid';
  gallery.photos = toGalleryPhotos(photos);
  gallery.addEventListener(PHOTO_GALLERY_SELECT_EVENT, ((event: CustomEvent<PhotoGallerySelectDetail>) => {
    callbacks.onSelectPhoto(event.detail.index);
  }) as EventListener);
  section.appendChild(gallery);

  return section;
}
