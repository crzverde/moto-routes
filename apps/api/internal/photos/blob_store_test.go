package photos

import (
	"bytes"
	"context"
	"os"
	"testing"

	minio "github.com/minio/minio-go/v7"
)

// testBlobStore conecta contra un MinIO real (variables MINIO_* de entorno)
// y asegura que el bucket de test existe. Si MINIO_ENDPOINT no está
// definida, omite el test — son tests de integración deliberados contra un
// MinIO real, no un fake, mismo criterio que dbtest.Connect contra Postgres.
func testBlobStore(t *testing.T) MinioBlobStore {
	t.Helper()

	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		t.Skip("MINIO_ENDPOINT no está definida; test de integración omitido")
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	bucket := "test-route-photos"

	store, err := NewMinioBlobStore(endpoint, accessKey, secretKey, bucket, false)
	if err != nil {
		t.Fatalf("failed to create MinIO client: %v", err)
	}

	ctx := context.Background()
	exists, err := store.Client.BucketExists(ctx, bucket)
	if err != nil {
		t.Fatalf("failed to check test bucket: %v", err)
	}
	if !exists {
		if err := store.Client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			t.Fatalf("failed to create test bucket: %v", err)
		}
	}

	return store
}

func TestMinioBlobStore_PutThenGetReturnsSameBytes(t *testing.T) {
	store := testBlobStore(t)
	data := []byte("fake encrypted photo bytes for round-trip test")

	if err := store.Put(context.Background(), "routes/route-1/photo-1", data); err != nil {
		t.Fatalf("unexpected error putting object: %v", err)
	}

	got, err := store.Get(context.Background(), "routes/route-1/photo-1")
	if err != nil {
		t.Fatalf("unexpected error getting object: %v", err)
	}
	if !bytes.Equal(got, data) {
		t.Fatalf("expected the same bytes back, got %q", got)
	}
}

func TestMinioBlobStore_DeleteThenGetReturnsNotFound(t *testing.T) {
	store := testBlobStore(t)
	key := "routes/route-2/photo-1"

	if err := store.Put(context.Background(), key, []byte("to be deleted")); err != nil {
		t.Fatalf("unexpected error putting object: %v", err)
	}
	if err := store.Delete(context.Background(), key); err != nil {
		t.Fatalf("unexpected error deleting object: %v", err)
	}

	if _, err := store.Get(context.Background(), key); err != ErrObjectNotFound {
		t.Fatalf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestMinioBlobStore_GetNonExistentObjectReturnsNotFound(t *testing.T) {
	store := testBlobStore(t)

	if _, err := store.Get(context.Background(), "routes/never-existed/photo-x"); err != ErrObjectNotFound {
		t.Fatalf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestMinioBlobStore_DeleteNonExistentObjectIsNotAnError(t *testing.T) {
	store := testBlobStore(t)

	if err := store.Delete(context.Background(), "routes/never-existed/photo-y"); err != nil {
		t.Fatalf("expected deleting a non-existent object to be a no-op, got %v", err)
	}
}
