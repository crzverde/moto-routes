// Package config lee la configuración de apps/api exclusivamente de variables
// de entorno — ningún secreto ni cadena de conexión vive en código versionado.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/crzverde/moto-routes/apps/api/internal/photos"
)

// Config es la configuración de arranque del servicio.
type Config struct {
	// DatabaseURL es el DSN de PostgreSQL (postgres://user:pass@host:port/db).
	DatabaseURL string
	// ServerAddress es la dirección host:puerto en la que escucha el servidor HTTP.
	ServerAddress string
	// TokenSigningKey firma los tokens de sesión (JWT). Es un secreto: sin valor por defecto.
	TokenSigningKey []byte
	// ResendAPIKey autentica las llamadas a la API de Resend. Es un secreto: sin valor por defecto.
	ResendAPIKey string
	// ResendFromAddress es el remitente ("Nombre <direccion@dominio>") de los emails enviados vía Resend.
	ResendFromAddress string
	// PublicAPIBaseURL es la URL pública y absoluta (https://) desde la que
	// se construyen los enlaces de verificación de email. Debe empezar por
	// https:// — una URL relativa o sin esquema causó el incidente de
	// ADR-036 con MOBILE_PROD_API_BASE_URL; aquí se rechaza en el arranque.
	PublicAPIBaseURL string
	// MinioEndpoint es host:puerto del servidor MinIO (sin esquema).
	MinioEndpoint string
	// MinioAccessKey/MinioSecretKey autentican contra MinIO. Secretos: sin valor por defecto.
	MinioAccessKey string
	MinioSecretKey string
	// MinioBucket es el bucket donde se guardan las fotos de ruta.
	MinioBucket string
	// PhotoEncryptionKey cifra/descifra las fotos de ruta (AES-256-GCM, ver
	// internal/photos). Es un secreto: sin valor por defecto, nunca vive
	// junto a los datos que cifra (MinIO).
	PhotoEncryptionKey []byte
}

// Load lee la configuración desde variables de entorno. DATABASE_URL,
// AUTH_TOKEN_SECRET, RESEND_API_KEY, RESEND_FROM_ADDRESS y
// PUBLIC_API_BASE_URL son obligatorias y sin valor por defecto. SERVER_ADDRESS
// por defecto es 0.0.0.0 para no romper el entorno local; en producción se
// fija a la interfaz de Tailscale del servidor.
func Load() (Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return Config{}, errors.New("DATABASE_URL environment variable is required")
	}

	tokenSecret := os.Getenv("AUTH_TOKEN_SECRET")
	if tokenSecret == "" {
		return Config{}, errors.New("AUTH_TOKEN_SECRET environment variable is required")
	}

	resendAPIKey := os.Getenv("RESEND_API_KEY")
	if resendAPIKey == "" {
		return Config{}, errors.New("RESEND_API_KEY environment variable is required")
	}

	resendFromAddress := os.Getenv("RESEND_FROM_ADDRESS")
	if resendFromAddress == "" {
		return Config{}, errors.New("RESEND_FROM_ADDRESS environment variable is required")
	}

	publicAPIBaseURL := os.Getenv("PUBLIC_API_BASE_URL")
	if publicAPIBaseURL == "" {
		return Config{}, errors.New("PUBLIC_API_BASE_URL environment variable is required")
	}
	if !strings.HasPrefix(publicAPIBaseURL, "https://") {
		return Config{}, errors.New("PUBLIC_API_BASE_URL must start with https://")
	}

	host := os.Getenv("SERVER_ADDRESS")
	if host == "" {
		host = "0.0.0.0"
	}

	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		return Config{}, errors.New("MINIO_ENDPOINT environment variable is required")
	}
	minioAccessKey := os.Getenv("MINIO_ACCESS_KEY")
	if minioAccessKey == "" {
		return Config{}, errors.New("MINIO_ACCESS_KEY environment variable is required")
	}
	minioSecretKey := os.Getenv("MINIO_SECRET_KEY")
	if minioSecretKey == "" {
		return Config{}, errors.New("MINIO_SECRET_KEY environment variable is required")
	}
	minioBucket := os.Getenv("MINIO_BUCKET")
	if minioBucket == "" {
		return Config{}, errors.New("MINIO_BUCKET environment variable is required")
	}

	photoEncryptionKeyEncoded := os.Getenv("PHOTO_ENCRYPTION_KEY")
	if photoEncryptionKeyEncoded == "" {
		return Config{}, errors.New("PHOTO_ENCRYPTION_KEY environment variable is required")
	}
	photoEncryptionKey, err := photos.DecodeKey(photoEncryptionKeyEncoded)
	if err != nil {
		return Config{}, fmt.Errorf("invalid PHOTO_ENCRYPTION_KEY: %w", err)
	}

	return Config{
		DatabaseURL:        dbURL,
		ServerAddress:      host + ":8080",
		TokenSigningKey:    []byte(tokenSecret),
		ResendAPIKey:       resendAPIKey,
		ResendFromAddress:  resendFromAddress,
		PublicAPIBaseURL:   publicAPIBaseURL,
		MinioEndpoint:      minioEndpoint,
		MinioAccessKey:     minioAccessKey,
		MinioSecretKey:     minioSecretKey,
		MinioBucket:        minioBucket,
		PhotoEncryptionKey: photoEncryptionKey,
	}, nil
}
