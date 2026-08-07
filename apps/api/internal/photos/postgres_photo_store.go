package photos

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresPhotoStore implementa PhotoStore contra la tabla route_photos
// real. La propiedad de una foto se resuelve siempre a través de su
// route_id contra routes.user_id — route_photos nunca guarda su propio
// user_id (ver design.md, Decisión 4).
type PostgresPhotoStore struct {
	Pool *pgxpool.Pool
}

// Create guarda los metadatos de una nueva foto tras comprobar que la ruta
// pertenece al usuario y que no supera MaxPhotosPerRoute.
func (s PostgresPhotoStore) Create(ctx context.Context, userID int64, photo Photo) (Photo, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Photo{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := checkRouteOwnership(ctx, tx, userID, photo.RouteID); err != nil {
		return Photo{}, err
	}

	var count int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM route_photos WHERE route_id = $1", photo.RouteID).Scan(&count); err != nil {
		return Photo{}, err
	}
	if count >= MaxPhotosPerRoute {
		return Photo{}, ErrTooManyPhotos
	}

	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO route_photos (id, route_id, object_key, mime_type, latitude, longitude, captured_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at`,
		photo.ID, photo.RouteID, photo.ObjectKey, photo.MimeType, photo.Latitude, photo.Longitude, photo.CapturedAt,
	).Scan(&createdAt)
	if err != nil {
		return Photo{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Photo{}, err
	}

	photo.CreatedAt = createdAt.Format(time.RFC3339)
	return photo, nil
}

// ListByRoute devuelve los metadatos de las fotos de una ruta del usuario, en orden de captura.
func (s PostgresPhotoStore) ListByRoute(ctx context.Context, userID int64, routeID string) ([]Photo, error) {
	if err := checkRouteOwnership(ctx, s.Pool, userID, routeID); err != nil {
		return nil, err
	}

	rows, err := s.Pool.Query(ctx,
		"SELECT id, route_id, mime_type, latitude, longitude, captured_at, created_at FROM route_photos WHERE route_id = $1 ORDER BY captured_at ASC",
		routeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	photoList := []Photo{}
	for rows.Next() {
		var p Photo
		var createdAt time.Time
		if err := rows.Scan(&p.ID, &p.RouteID, &p.MimeType, &p.Latitude, &p.Longitude, &p.CapturedAt, &createdAt); err != nil {
			return nil, err
		}
		p.CreatedAt = createdAt.Format(time.RFC3339)
		photoList = append(photoList, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return photoList, nil
}

// GetByIDForRoute devuelve los metadatos de una foto (incluido su
// ObjectKey interno) si su ruta pertenece al usuario.
func (s PostgresPhotoStore) GetByIDForRoute(ctx context.Context, userID int64, routeID, photoID string) (Photo, error) {
	if err := checkRouteOwnership(ctx, s.Pool, userID, routeID); err != nil {
		return Photo{}, err
	}

	var p Photo
	var createdAt time.Time
	err := s.Pool.QueryRow(ctx,
		"SELECT id, route_id, object_key, mime_type, latitude, longitude, captured_at, created_at FROM route_photos WHERE id = $1 AND route_id = $2",
		photoID, routeID,
	).Scan(&p.ID, &p.RouteID, &p.ObjectKey, &p.MimeType, &p.Latitude, &p.Longitude, &p.CapturedAt, &createdAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Photo{}, ErrPhotoNotFound
		}
		return Photo{}, err
	}
	p.CreatedAt = createdAt.Format(time.RFC3339)
	return p, nil
}

// Delete borra los metadatos de una foto tras comprobar la propiedad de su ruta.
func (s PostgresPhotoStore) Delete(ctx context.Context, userID int64, routeID, photoID string) error {
	if err := checkRouteOwnership(ctx, s.Pool, userID, routeID); err != nil {
		return err
	}

	tag, err := s.Pool.Exec(ctx, "DELETE FROM route_photos WHERE id = $1 AND route_id = $2", photoID, routeID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPhotoNotFound
	}
	return nil
}

// querier es lo mínimo común entre *pgxpool.Pool y pgx.Tx que necesita checkRouteOwnership.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// checkRouteOwnership confirma que routeID existe y pertenece a userID.
// Devuelve ErrRouteOwnedByAnotherUser tanto si la ruta no existe como si es
// de otro usuario — nunca revela cuál de los dos casos es.
func checkRouteOwnership(ctx context.Context, q querier, userID int64, routeID string) error {
	var exists bool
	err := q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM routes WHERE id = $1 AND user_id = $2)", routeID, userID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return ErrRouteOwnedByAnotherUser
	}
	return nil
}
