// Package photos persiste las fotos de una ruta (bytes cifrados en un
// almacenamiento de objetos, metadatos en Postgres), siempre acotadas a la
// ruta propietaria y por tanto al usuario autenticado.
package photos

import (
	"context"
	"errors"
)

// MaxPhotosPerRoute es el límite de fotos aceptado por ruta — ya existía
// solo en el cliente (MAX_PHOTOS_PER_ROUTE en apps/mobile); aquí se aplica
// también en el servidor.
const MaxPhotosPerRoute = 100

// MaxPhotoSizeBytes es el tamaño máximo aceptado por foto — margen holgado
// sobre un JPEG de cámara de móvil moderno.
const MaxPhotoSizeBytes = 15 * 1024 * 1024

// ErrTooManyPhotos indica que la ruta ya tiene MaxPhotosPerRoute fotos.
var ErrTooManyPhotos = errors.New("route already has the maximum number of photos")

// ErrPhotoTooLarge indica que la foto supera MaxPhotoSizeBytes.
var ErrPhotoTooLarge = errors.New("photo exceeds the maximum allowed size")

// ErrRouteOwnedByAnotherUser indica que la ruta indicada no pertenece al
// usuario autenticado (o no existe) — mismo caso en ambos, nunca se revela cuál.
var ErrRouteOwnedByAnotherUser = errors.New("route does not belong to the authenticated user")

// ErrPhotoNotFound indica que el identificador de foto no existe para esa ruta.
var ErrPhotoNotFound = errors.New("photo not found")

// Photo son los metadatos de una foto de ruta, sin sus bytes de imagen.
type Photo struct {
	ID         string   `json:"id"`
	RouteID    string   `json:"route_id"`
	MimeType   string   `json:"mime_type"`
	Latitude   *float64 `json:"latitude"`
	Longitude  *float64 `json:"longitude"`
	CapturedAt string   `json:"captured_at"`
	CreatedAt  string   `json:"created_at"`
	// ObjectKey identifica los bytes de la foto en el BlobStore — detalle de
	// almacenamiento interno, nunca se expone en una respuesta JSON.
	ObjectKey string `json:"-"`
}

// PhotoStore persiste y consulta metadatos de fotos, siempre acotados a que
// la ruta pertenezca al usuario indicado.
type PhotoStore interface {
	// Create guarda los metadatos de una nueva foto y devuelve el registro
	// completo (con CreatedAt ya asignado por la base de datos). Devuelve
	// ErrRouteOwnedByAnotherUser si la ruta no existe o no es del usuario,
	// ErrTooManyPhotos si la ruta ya tiene MaxPhotosPerRoute fotos.
	Create(ctx context.Context, userID int64, photo Photo) (Photo, error)
	// ListByRoute devuelve los metadatos de las fotos de una ruta del
	// usuario, en orden de captura. Devuelve ErrRouteOwnedByAnotherUser si
	// la ruta no existe o no es del usuario.
	ListByRoute(ctx context.Context, userID int64, routeID string) ([]Photo, error)
	// GetByIDForRoute devuelve los metadatos de una foto si su ruta
	// pertenece al usuario. Devuelve ErrRouteOwnedByAnotherUser si la ruta
	// no es del usuario, ErrPhotoNotFound si la foto no existe en esa ruta.
	GetByIDForRoute(ctx context.Context, userID int64, routeID, photoID string) (Photo, error)
	// Delete borra los metadatos de una foto. Mismos errores que GetByIDForRoute.
	Delete(ctx context.Context, userID int64, routeID, photoID string) error
}

// BlobStore persiste y consulta los bytes (ya cifrados) de una foto en el
// almacenamiento de objetos subyacente, direccionados por su object_key.
type BlobStore interface {
	Put(ctx context.Context, objectKey string, data []byte) error
	Get(ctx context.Context, objectKey string) ([]byte, error)
	Delete(ctx context.Context, objectKey string) error
}
