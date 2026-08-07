package photos

import (
	"bytes"
	"context"
	"errors"
	"io"

	minio "github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// ErrObjectNotFound indica que object_key no existe en el bucket.
var ErrObjectNotFound = errors.New("object not found in blob storage")

// MinioBlobStore implementa BlobStore contra un bucket de MinIO real (S3-compatible).
type MinioBlobStore struct {
	Client *minio.Client
	Bucket string
}

// NewMinioBlobStore conecta contra un endpoint de MinIO con credenciales
// estáticas. secure controla si la conexión usa TLS — false para el
// despliegue actual (loopback, sin TLS entre apps/api y MinIO en el mismo host).
func NewMinioBlobStore(endpoint, accessKey, secretKey, bucket string, secure bool) (MinioBlobStore, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return MinioBlobStore{}, err
	}
	return MinioBlobStore{Client: client, Bucket: bucket}, nil
}

// Put sube data (ya cifrado por la capa de dominio) al bucket bajo objectKey.
func (s MinioBlobStore) Put(ctx context.Context, objectKey string, data []byte) error {
	_, err := s.Client.PutObject(ctx, s.Bucket, objectKey, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	return err
}

// Get descarga los bytes (todavía cifrados) almacenados bajo objectKey.
// Devuelve ErrObjectNotFound si no existe.
func (s MinioBlobStore) Get(ctx context.Context, objectKey string) ([]byte, error) {
	object, err := s.Client.GetObject(ctx, s.Bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		if isNoSuchKey(err) {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}
	defer object.Close()

	data, err := io.ReadAll(object)
	if err != nil {
		if isNoSuchKey(err) {
			return nil, ErrObjectNotFound
		}
		return nil, err
	}
	return data, nil
}

// Delete borra el objeto bajo objectKey. Borrar un objeto que ya no existe
// no es un error (mismo criterio idempotente que el resto de la API).
func (s MinioBlobStore) Delete(ctx context.Context, objectKey string) error {
	return s.Client.RemoveObject(ctx, s.Bucket, objectKey, minio.RemoveObjectOptions{})
}

func isNoSuchKey(err error) bool {
	return minio.ToErrorResponse(err).Code == "NoSuchKey"
}
