package photos

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/crzverde/moto-routes/apps/api/internal/auth"
)

// maxMultipartMemory es cuánto del cuerpo multipart se mantiene en memoria
// antes de que ParseMultipartForm derrame a ficheros temporales — no acota
// el tamaño de la foto en sí, eso lo hace MaxPhotoSizeBytes más abajo.
const maxMultipartMemory = 1 << 20 // 1MiB

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func requireUserID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "missing or invalid token")
		return 0, false
	}
	return userID, true
}

// writeStoreError traduce los errores de dominio a la respuesta HTTP.
// ErrRouteOwnedByAnotherUser responde 404 "route not found" tanto si la
// ruta no existe como si es de otra cuenta — nunca revela cuál de los dos
// casos es (mismo criterio que routes.DetailHandler).
func writeStoreError(w http.ResponseWriter, err error) {
	switch err {
	case ErrRouteOwnedByAnotherUser:
		writeError(w, http.StatusNotFound, "route not found")
	case ErrPhotoNotFound:
		writeError(w, http.StatusNotFound, "photo not found")
	case ErrTooManyPhotos:
		writeError(w, http.StatusBadRequest, "route already has the maximum number of photos")
	default:
		writeError(w, http.StatusInternalServerError, "could not process the request")
	}
}

func parseOptionalFloat(value string) *float64 {
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

// UploadHandler sube una foto nueva a una ruta del usuario autenticado. Los
// bytes se cifran antes de subirlos al BlobStore (nunca en claro); el
// BlobStore se escribe antes que los metadatos en Postgres — si la
// comprobación de propiedad/límite falla después, el resultado es un objeto
// huérfano en el almacenamiento (inofensivo, nunca referenciado), nunca una
// fila de metadatos sin bytes detrás (ver design.md, Risks).
func UploadHandler(photoStore PhotoStore, blobStore BlobStore, encryptionKey []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUserID(w, r)
		if !ok {
			return
		}
		routeID := chi.URLParam(r, "id")

		r.Body = http.MaxBytesReader(w, r.Body, MaxPhotoSizeBytes+maxMultipartMemory)
		if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
			writeError(w, http.StatusBadRequest, "photo exceeds the maximum allowed size or the request body is invalid")
			return
		}

		file, header, err := r.FormFile("photo")
		if err != nil {
			writeError(w, http.StatusBadRequest, "a photo file is required")
			return
		}
		defer file.Close()

		if header.Size > MaxPhotoSizeBytes {
			writeError(w, http.StatusBadRequest, "photo exceeds the maximum allowed size")
			return
		}

		plaintext, err := io.ReadAll(file)
		if err != nil {
			writeError(w, http.StatusBadRequest, "could not read the uploaded photo")
			return
		}

		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}

		photo := Photo{
			ID:         uuid.NewString(),
			RouteID:    routeID,
			MimeType:   mimeType,
			Latitude:   parseOptionalFloat(r.FormValue("latitude")),
			Longitude:  parseOptionalFloat(r.FormValue("longitude")),
			CapturedAt: r.FormValue("captured_at"),
		}
		photo.ObjectKey = "routes/" + routeID + "/" + photo.ID

		ciphertext, err := Encrypt(encryptionKey, plaintext)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not process the request")
			return
		}

		if err := blobStore.Put(r.Context(), photo.ObjectKey, ciphertext); err != nil {
			writeError(w, http.StatusInternalServerError, "could not process the request")
			return
		}

		created, err := photoStore.Create(r.Context(), userID, photo)
		if err != nil {
			writeStoreError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, created)
	})
}

// ListHandler devuelve los metadatos (sin bytes) de las fotos de una ruta del usuario autenticado.
func ListHandler(photoStore PhotoStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUserID(w, r)
		if !ok {
			return
		}
		routeID := chi.URLParam(r, "id")

		list, err := photoStore.ListByRoute(r.Context(), userID, routeID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		if list == nil {
			list = []Photo{}
		}

		writeJSON(w, http.StatusOK, list)
	})
}

// DownloadHandler descifra y devuelve los bytes de una foto de una ruta del
// usuario autenticado — nunca genera ni redirige a una URL directa del
// almacenamiento subyacente (ver design.md, Decisión 3).
func DownloadHandler(photoStore PhotoStore, blobStore BlobStore, encryptionKey []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUserID(w, r)
		if !ok {
			return
		}
		routeID := chi.URLParam(r, "id")
		photoID := chi.URLParam(r, "photoId")

		photo, err := photoStore.GetByIDForRoute(r.Context(), userID, routeID, photoID)
		if err != nil {
			writeStoreError(w, err)
			return
		}

		ciphertext, err := blobStore.Get(r.Context(), photo.ObjectKey)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not process the request")
			return
		}

		plaintext, err := Decrypt(encryptionKey, ciphertext)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not process the request")
			return
		}

		w.Header().Set("Content-Type", photo.MimeType)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(plaintext)
	})
}

// DeleteHandler borra una foto (bytes y metadatos) de una ruta del usuario
// autenticado. Borra primero en el BlobStore y solo si tiene éxito borra
// los metadatos — mismo razonamiento que UploadHandler, en sentido inverso
// (ver design.md, Risks).
func DeleteHandler(photoStore PhotoStore, blobStore BlobStore) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUserID(w, r)
		if !ok {
			return
		}
		routeID := chi.URLParam(r, "id")
		photoID := chi.URLParam(r, "photoId")

		photo, err := photoStore.GetByIDForRoute(r.Context(), userID, routeID, photoID)
		if err != nil {
			writeStoreError(w, err)
			return
		}

		if err := blobStore.Delete(r.Context(), photo.ObjectKey); err != nil {
			writeError(w, http.StatusInternalServerError, "could not process the request")
			return
		}

		if err := photoStore.Delete(r.Context(), userID, routeID, photoID); err != nil {
			writeStoreError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}
