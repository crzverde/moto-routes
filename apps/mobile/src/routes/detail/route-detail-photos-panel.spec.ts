import { describe, it, expect, vi } from 'vitest';
import '../../shared/photo-capture/photo-capture.element.js';
import { toGalleryPhotos, buildPhotosSection } from './route-detail-photos-panel.js';
import { PHOTO_CAPTURE_EVENT } from '../../shared/photo-capture/photo-capture.types.js';
import { PHOTO_GALLERY_SELECT_EVENT, type GalleryPhoto } from '../../shared/photo-gallery/photo-gallery.element.js';
import type { PhotoWithUrl } from './route-detail.types.js';

describe('toGalleryPhotos', () => {
  it('keeps only id and objectUrl, the minimal shape <photo-gallery> expects', () => {
    const photos = [{ id: 'p1', objectUrl: 'blob:1', routeId: 'r1', takenAt: 0 } as unknown as PhotoWithUrl];
    expect(toGalleryPhotos(photos)).toEqual([{ id: 'p1', objectUrl: 'blob:1' }]);
  });
});

describe('buildPhotosSection', () => {
  it('renders a slot="fotos" section with the capture button and the gallery', () => {
    const section = buildPhotosSection([], { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, vi.fn());

    expect(section.getAttribute('slot')).toBe('fotos');
    expect(section.querySelector('[data-cy="detail-photo-capture"]')).not.toBeNull();
    expect(section.querySelector('photo-gallery')).not.toBeNull();
  });

  it('registers the capture element via registerCaptureEl', () => {
    const registerCaptureEl = vi.fn();
    const section = buildPhotosSection([], { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, registerCaptureEl);

    expect(registerCaptureEl).toHaveBeenCalledWith(section.querySelector('[data-cy="detail-photo-capture"]'));
  });

  it('forwards a photo-capture:select event to onAddPhoto with its source', () => {
    const onAddPhoto = vi.fn();
    const section = buildPhotosSection([], { onAddPhoto, onSelectPhoto: vi.fn() }, vi.fn());
    const capture = section.querySelector('[data-cy="detail-photo-capture"]')!;

    capture.dispatchEvent(new CustomEvent(PHOTO_CAPTURE_EVENT, { detail: { source: 'camera' } }));

    expect(onAddPhoto).toHaveBeenCalledWith('camera');
  });

  it('forwards a photo-gallery:select event to onSelectPhoto with its index', () => {
    const onSelectPhoto = vi.fn();
    const section = buildPhotosSection([], { onAddPhoto: vi.fn(), onSelectPhoto }, vi.fn());
    const gallery = section.querySelector('photo-gallery')!;

    gallery.dispatchEvent(new CustomEvent(PHOTO_GALLERY_SELECT_EVENT, { detail: { index: 2 } }));

    expect(onSelectPhoto).toHaveBeenCalledWith(2);
  });

  it('passes the adapted photos to <photo-gallery> in grid layout', () => {
    const photos = [{ id: 'p1', objectUrl: 'blob:1' } as PhotoWithUrl];
    const section = buildPhotosSection(photos, { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, vi.fn());
    const gallery = section.querySelector('photo-gallery') as HTMLElement & { photos: GalleryPhoto[]; layout: string };

    expect(gallery.layout).toBe('grid');
    expect(gallery.photos).toEqual([{ id: 'p1', objectUrl: 'blob:1' }]);
  });

  it('disables the capture button once the photo limit is reached', () => {
    const manyPhotos = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, objectUrl: `blob:${i}` }) as PhotoWithUrl);
    const section = buildPhotosSection(manyPhotos, { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, vi.fn());
    const capture = section.querySelector('[data-cy="detail-photo-capture"]') as HTMLElement & { disabled: boolean };

    expect(capture.disabled).toBe(true);
  });

  it('omits the <photo-capture> element when readOnly is true (ruta exclusiva de la nube)', () => {
    const photos = [{ id: 'p1', objectUrl: 'blob:1' } as PhotoWithUrl];
    const section = buildPhotosSection(photos, { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, vi.fn(), { readOnly: true });

    expect(section.querySelector('[data-cy="detail-photo-capture"]')).toBeNull();
    expect(section.querySelector('photo-gallery')).not.toBeNull();
  });

  it('renders the <photo-capture> element when readOnly is omitted (default false)', () => {
    const section = buildPhotosSection([], { onAddPhoto: vi.fn(), onSelectPhoto: vi.fn() }, vi.fn());

    expect(section.querySelector('[data-cy="detail-photo-capture"]')).not.toBeNull();
  });
});
