package photos

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/crzverde/moto-routes/apps/api/internal/auth"
)

type fakePhotoStore struct {
	createErr error
	created   []Photo
	byRoute   map[string][]Photo
	byID      map[string]Photo
	getErr    error
	deleteErr error
	deleted   []string
}

func newFakePhotoStore() *fakePhotoStore {
	return &fakePhotoStore{byRoute: map[string][]Photo{}, byID: map[string]Photo{}}
}

func (f *fakePhotoStore) Create(_ context.Context, _ int64, photo Photo) (Photo, error) {
	if f.createErr != nil {
		return Photo{}, f.createErr
	}
	photo.CreatedAt = "2026-08-07T10:00:00Z"
	f.created = append(f.created, photo)
	return photo, nil
}

func (f *fakePhotoStore) ListByRoute(_ context.Context, _ int64, routeID string) ([]Photo, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	return f.byRoute[routeID], nil
}

func (f *fakePhotoStore) GetByIDForRoute(_ context.Context, _ int64, _ string, photoID string) (Photo, error) {
	if f.getErr != nil {
		return Photo{}, f.getErr
	}
	photo, ok := f.byID[photoID]
	if !ok {
		return Photo{}, ErrPhotoNotFound
	}
	return photo, nil
}

func (f *fakePhotoStore) Delete(_ context.Context, _ int64, _ string, photoID string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.deleted = append(f.deleted, photoID)
	return nil
}

type fakeBlobStore struct {
	putErr    error
	getErr    error
	deleteErr error
	objects   map[string][]byte
	deleted   []string
}

func newFakeBlobStore() *fakeBlobStore {
	return &fakeBlobStore{objects: map[string][]byte{}}
}

func (f *fakeBlobStore) Put(_ context.Context, key string, data []byte) error {
	if f.putErr != nil {
		return f.putErr
	}
	f.objects[key] = data
	return nil
}

func (f *fakeBlobStore) Get(_ context.Context, key string) ([]byte, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	data, ok := f.objects[key]
	if !ok {
		return nil, ErrObjectNotFound
	}
	return data, nil
}

func (f *fakeBlobStore) Delete(_ context.Context, key string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}
	f.deleted = append(f.deleted, key)
	delete(f.objects, key)
	return nil
}

func testIssuer() auth.TokenIssuer {
	return auth.TokenIssuer{Secret: []byte("photos-handler-test-secret"), TTL: time.Hour}
}

func bearerFor(t *testing.T, userID int64) string {
	t.Helper()
	token, err := testIssuer().Issue(userID)
	if err != nil {
		t.Fatalf("failed to issue test token: %v", err)
	}
	return token
}

func testKey() []byte {
	return bytes.Repeat([]byte("k"), KeySize)
}

func withURLParams(req *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func multipartUploadBody(t *testing.T, fieldName, filename string, content []byte, extraFields map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("failed to write file content: %v", err)
	}
	for k, v := range extraFields {
		if err := writer.WriteField(k, v); err != nil {
			t.Fatalf("failed to write field %s: %v", k, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}
	return body, writer.FormDataContentType()
}

func TestUploadHandler_SuccessEncryptsAndStores(t *testing.T) {
	photoStore := newFakePhotoStore()
	blobStore := newFakeBlobStore()
	handler := auth.RequireAuth(testIssuer())(UploadHandler(photoStore, blobStore, testKey()))

	plaintext := []byte("fake jpeg bytes")
	body, contentType := multipartUploadBody(t, "photo", "photo.jpg", plaintext, map[string]string{
		"latitude": "40.1", "longitude": "-3.1", "captured_at": "2026-08-07T10:00:00.000Z",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/routes/route-1/photos", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(photoStore.created) != 1 {
		t.Fatalf("expected exactly one photo to be created, got %d", len(photoStore.created))
	}
	stored, ok := blobStore.objects[photoStore.created[0].ObjectKey]
	if !ok {
		t.Fatal("expected the object to have been stored in the blob store")
	}
	if bytes.Equal(stored, plaintext) {
		t.Fatal("expected the stored bytes to be encrypted, not the original plaintext")
	}
}

func TestUploadHandler_WithoutTokenReturns401(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(UploadHandler(newFakePhotoStore(), newFakeBlobStore(), testKey()))
	body, contentType := multipartUploadBody(t, "photo", "photo.jpg", []byte("x"), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/routes/route-1/photos", body)
	req.Header.Set("Content-Type", contentType)
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestUploadHandler_OnAnotherUsersRouteReturns404WithoutStoringInBlob(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.createErr = ErrRouteOwnedByAnotherUser
	blobStore := newFakeBlobStore()
	handler := auth.RequireAuth(testIssuer())(UploadHandler(photoStore, blobStore, testKey()))
	body, contentType := multipartUploadBody(t, "photo", "photo.jpg", []byte("x"), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/routes/route-1/photos", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUploadHandler_TooManyPhotosReturns400(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.createErr = ErrTooManyPhotos
	handler := auth.RequireAuth(testIssuer())(UploadHandler(photoStore, newFakeBlobStore(), testKey()))
	body, contentType := multipartUploadBody(t, "photo", "photo.jpg", []byte("x"), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/routes/route-1/photos", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUploadHandler_TooLargePhotoRejectedWithoutReachingBlobStore(t *testing.T) {
	photoStore := newFakePhotoStore()
	blobStore := newFakeBlobStore()
	handler := auth.RequireAuth(testIssuer())(UploadHandler(photoStore, blobStore, testKey()))

	oversized := bytes.Repeat([]byte("a"), MaxPhotoSizeBytes+1)
	body, contentType := multipartUploadBody(t, "photo", "photo.jpg", oversized, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/routes/route-1/photos", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(blobStore.objects) != 0 {
		t.Fatal("expected the oversized photo to never reach the blob store")
	}
	if len(photoStore.created) != 0 {
		t.Fatal("expected no metadata to be created for a rejected upload")
	}
}

func TestListHandler_ReturnsMetadataWithoutBytes(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.byRoute["route-1"] = []Photo{{ID: "photo-1", RouteID: "route-1", MimeType: "image/jpeg", ObjectKey: "internal/key"}}
	handler := auth.RequireAuth(testIssuer())(ListHandler(photoStore))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("internal/key")) {
		t.Fatal("expected the internal object key to never appear in the JSON response")
	}
	var body []Photo
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(body) != 1 || body[0].ID != "photo-1" {
		t.Fatalf("expected exactly the route's photo, got %+v", body)
	}
}

func TestListHandler_EmptyWhenNoPhotos(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(ListHandler(newFakePhotoStore()))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	var body []Photo
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("expected an empty list, got %+v", body)
	}
}

func TestListHandler_WithoutTokenReturns401(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(ListHandler(newFakePhotoStore()))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos", nil)
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestListHandler_OnAnotherUsersRouteReturns404(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.getErr = ErrRouteOwnedByAnotherUser
	handler := auth.RequireAuth(testIssuer())(ListHandler(photoStore))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", rec.Code)
	}
}

func TestDownloadHandler_ReturnsDecryptedBytes(t *testing.T) {
	key := testKey()
	plaintext := []byte("original photo bytes")
	ciphertext, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	photoStore := newFakePhotoStore()
	photoStore.byID["photo-1"] = Photo{ID: "photo-1", RouteID: "route-1", MimeType: "image/jpeg", ObjectKey: "routes/route-1/photo-1"}
	blobStore := newFakeBlobStore()
	blobStore.objects["routes/route-1/photo-1"] = ciphertext

	handler := auth.RequireAuth(testIssuer())(DownloadHandler(photoStore, blobStore, key))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos/photo-1", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("expected Content-Type image/jpeg, got %s", rec.Header().Get("Content-Type"))
	}
	got, _ := io.ReadAll(rec.Body)
	if !bytes.Equal(got, plaintext) {
		t.Fatalf("expected decrypted original bytes, got %q", got)
	}
}

func TestDownloadHandler_UnknownPhotoIDReturns404(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(DownloadHandler(newFakePhotoStore(), newFakeBlobStore(), testKey()))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos/unknown", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "unknown"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", rec.Code)
	}
}

func TestDownloadHandler_OnAnotherUsersRouteReturns404(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.getErr = ErrRouteOwnedByAnotherUser
	handler := auth.RequireAuth(testIssuer())(DownloadHandler(photoStore, newFakeBlobStore(), testKey()))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos/photo-1", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", rec.Code)
	}
}

func TestDownloadHandler_WithoutTokenReturns401(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(DownloadHandler(newFakePhotoStore(), newFakeBlobStore(), testKey()))

	req := httptest.NewRequest(http.MethodGet, "/api/routes/route-1/photos/photo-1", nil)
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestDeleteHandler_DeletesFromBlobStoreThenMetadata(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.byID["photo-1"] = Photo{ID: "photo-1", RouteID: "route-1", ObjectKey: "routes/route-1/photo-1"}
	blobStore := newFakeBlobStore()
	blobStore.objects["routes/route-1/photo-1"] = []byte("ciphertext")

	handler := auth.RequireAuth(testIssuer())(DeleteHandler(photoStore, blobStore))

	req := httptest.NewRequest(http.MethodDelete, "/api/routes/route-1/photos/photo-1", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(blobStore.deleted) != 1 || blobStore.deleted[0] != "routes/route-1/photo-1" {
		t.Fatalf("expected the object to be deleted from the blob store, got %+v", blobStore.deleted)
	}
	if len(photoStore.deleted) != 1 || photoStore.deleted[0] != "photo-1" {
		t.Fatalf("expected the metadata row to be deleted, got %+v", photoStore.deleted)
	}
}

func TestDeleteHandler_OnAnotherUsersRouteReturns404WithoutDeletingAnything(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.getErr = ErrRouteOwnedByAnotherUser
	blobStore := newFakeBlobStore()

	handler := auth.RequireAuth(testIssuer())(DeleteHandler(photoStore, blobStore))

	req := httptest.NewRequest(http.MethodDelete, "/api/routes/route-1/photos/photo-1", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", rec.Code)
	}
	if len(blobStore.deleted) != 0 || len(photoStore.deleted) != 0 {
		t.Fatal("expected nothing to be deleted when the route ownership check fails")
	}
}

func TestDeleteHandler_BlobStoreFailureDoesNotDeleteMetadata(t *testing.T) {
	photoStore := newFakePhotoStore()
	photoStore.byID["photo-1"] = Photo{ID: "photo-1", RouteID: "route-1", ObjectKey: "routes/route-1/photo-1"}
	blobStore := newFakeBlobStore()
	blobStore.deleteErr = context.DeadlineExceeded

	handler := auth.RequireAuth(testIssuer())(DeleteHandler(photoStore, blobStore))

	req := httptest.NewRequest(http.MethodDelete, "/api/routes/route-1/photos/photo-1", nil)
	req.Header.Set("Authorization", "Bearer "+bearerFor(t, 42))
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(photoStore.deleted) != 0 {
		t.Fatal("expected the metadata row to remain when the blob store delete fails")
	}
}

func TestDeleteHandler_WithoutTokenReturns401(t *testing.T) {
	handler := auth.RequireAuth(testIssuer())(DeleteHandler(newFakePhotoStore(), newFakeBlobStore()))

	req := httptest.NewRequest(http.MethodDelete, "/api/routes/route-1/photos/photo-1", nil)
	req = withURLParams(req, map[string]string{"id": "route-1", "photoId": "photo-1"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}
