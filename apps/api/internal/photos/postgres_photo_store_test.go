package photos

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/crzverde/moto-routes/apps/api/internal/dbtest"
	"github.com/crzverde/moto-routes/apps/api/internal/migrate"
)

func testPhotoStore(t *testing.T) PostgresPhotoStore {
	t.Helper()

	pool := dbtest.Connect(t, "test_photos")
	if err := migrate.Run(context.Background(), pool, migrate.Migrations); err != nil {
		t.Fatalf("failed to apply migrations: %v", err)
	}

	return PostgresPhotoStore{Pool: pool}
}

func seedUser(t *testing.T, pool *pgxpool.Pool, email string) int64 {
	t.Helper()

	var id int64
	err := pool.QueryRow(context.Background(),
		"INSERT INTO users (email, password_hash) VALUES ($1, 'hash') RETURNING id", email,
	).Scan(&id)
	if err != nil {
		t.Fatalf("failed to seed user: %v", err)
	}
	return id
}

func seedRoute(t *testing.T, pool *pgxpool.Pool, userID int64, routeID string) {
	t.Helper()

	_, err := pool.Exec(context.Background(), `
		INSERT INTO routes (id, user_id, created_at, duration, total_distance, avg_speed, status)
		VALUES ($1, $2, '2026-08-07T10:00:00.000Z', 60, 1000, 30, 'completed')`,
		routeID, userID,
	)
	if err != nil {
		t.Fatalf("failed to seed route: %v", err)
	}
}

func samplePhoto(id, routeID string) Photo {
	lat, lng := 40.1, -3.1
	return Photo{
		ID:         id,
		RouteID:    routeID,
		ObjectKey:  "routes/" + routeID + "/" + id,
		MimeType:   "image/jpeg",
		Latitude:   &lat,
		Longitude:  &lng,
		CapturedAt: "2026-08-07T10:05:00.000Z",
	}
}

func TestPostgresPhotoStore_CreateThenGetByIDReturnsSamePhoto(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider1@example.com")
	routeID := "11111111-1111-1111-1111-111111111111"
	seedRoute(t, store.Pool, userID, routeID)
	photo := samplePhoto("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", routeID)

	if _, err := store.Create(context.Background(), userID, photo); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got, err := store.GetByIDForRoute(context.Background(), userID, routeID, photo.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ObjectKey != photo.ObjectKey || got.MimeType != photo.MimeType {
		t.Fatalf("expected the same photo metadata back, got %+v", got)
	}
}

func TestPostgresPhotoStore_CreateOnAnotherUsersRouteFails(t *testing.T) {
	store := testPhotoStore(t)
	owner := seedUser(t, store.Pool, "owner@example.com")
	attacker := seedUser(t, store.Pool, "attacker@example.com")
	routeID := "22222222-2222-2222-2222-222222222222"
	seedRoute(t, store.Pool, owner, routeID)

	_, err := store.Create(context.Background(), attacker, samplePhoto("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", routeID))
	if err != ErrRouteOwnedByAnotherUser {
		t.Fatalf("expected ErrRouteOwnedByAnotherUser, got %v", err)
	}

	list, err := store.ListByRoute(context.Background(), owner, routeID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected no photo to have been created, got %+v", list)
	}
}

func TestPostgresPhotoStore_CreateOnNonExistentRouteFails(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider2@example.com")

	_, err := store.Create(context.Background(), userID, samplePhoto("cccccccc-cccc-cccc-cccc-cccccccccccc", "99999999-9999-9999-9999-999999999999"))
	if err != ErrRouteOwnedByAnotherUser {
		t.Fatalf("expected ErrRouteOwnedByAnotherUser, got %v", err)
	}
}

func TestPostgresPhotoStore_CreateRejectsWhenRouteAlreadyHasMaxPhotos(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider3@example.com")
	routeID := "33333333-3333-3333-3333-333333333333"
	seedRoute(t, store.Pool, userID, routeID)

	for i := 0; i < MaxPhotosPerRoute; i++ {
		photo := samplePhoto(uuid.NewString(), routeID)
		if _, err := store.Create(context.Background(), userID, photo); err != nil {
			t.Fatalf("unexpected error seeding photo %d: %v", i, err)
		}
	}

	_, err := store.Create(context.Background(), userID, samplePhoto(uuid.NewString(), routeID))
	if err != ErrTooManyPhotos {
		t.Fatalf("expected ErrTooManyPhotos, got %v", err)
	}
}

func TestPostgresPhotoStore_ListByRouteIsEmptyWhenNoPhotos(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider4@example.com")
	routeID := "44444444-4444-4444-4444-444444444444"
	seedRoute(t, store.Pool, userID, routeID)

	list, err := store.ListByRoute(context.Background(), userID, routeID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected an empty list, got %+v", list)
	}
}

func TestPostgresPhotoStore_ListByRouteOfAnotherUserFails(t *testing.T) {
	store := testPhotoStore(t)
	owner := seedUser(t, store.Pool, "owner2@example.com")
	other := seedUser(t, store.Pool, "other2@example.com")
	routeID := "55555555-5555-5555-5555-555555555555"
	seedRoute(t, store.Pool, owner, routeID)

	if _, err := store.ListByRoute(context.Background(), other, routeID); err != ErrRouteOwnedByAnotherUser {
		t.Fatalf("expected ErrRouteOwnedByAnotherUser, got %v", err)
	}
}

func TestPostgresPhotoStore_GetByIDReturnsNotFoundForUnknownPhoto(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider5@example.com")
	routeID := "66666666-6666-6666-6666-666666666666"
	seedRoute(t, store.Pool, userID, routeID)

	_, err := store.GetByIDForRoute(context.Background(), userID, routeID, "77777777-7777-7777-7777-777777777777")
	if err != ErrPhotoNotFound {
		t.Fatalf("expected ErrPhotoNotFound, got %v", err)
	}
}

func TestPostgresPhotoStore_DeleteRemovesPhotoFromListing(t *testing.T) {
	store := testPhotoStore(t)
	userID := seedUser(t, store.Pool, "rider6@example.com")
	routeID := "88888888-8888-8888-8888-888888888888"
	seedRoute(t, store.Pool, userID, routeID)
	photo := samplePhoto("dddddddd-dddd-dddd-dddd-dddddddddddd", routeID)
	if _, err := store.Create(context.Background(), userID, photo); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := store.Delete(context.Background(), userID, routeID, photo.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	list, err := store.ListByRoute(context.Background(), userID, routeID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected the photo to be gone from the listing, got %+v", list)
	}
}

func TestPostgresPhotoStore_DeleteOnAnotherUsersRouteFailsWithoutDeleting(t *testing.T) {
	store := testPhotoStore(t)
	owner := seedUser(t, store.Pool, "owner3@example.com")
	attacker := seedUser(t, store.Pool, "attacker3@example.com")
	routeID := "aaaaaaaa-1111-1111-1111-111111111111"
	seedRoute(t, store.Pool, owner, routeID)
	photo := samplePhoto("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", routeID)
	if _, err := store.Create(context.Background(), owner, photo); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := store.Delete(context.Background(), attacker, routeID, photo.ID); err != ErrRouteOwnedByAnotherUser {
		t.Fatalf("expected ErrRouteOwnedByAnotherUser, got %v", err)
	}

	list, err := store.ListByRoute(context.Background(), owner, routeID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected the photo to remain untouched, got %+v", list)
	}
}
