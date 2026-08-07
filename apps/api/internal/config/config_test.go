package config

import (
	"encoding/base64"
	"testing"
)

// validPhotoEncryptionKey es una clave AES-256 (32 bytes) válida en base64,
// solo para tests — no un secreto real.
var validPhotoEncryptionKey = base64.StdEncoding.EncodeToString(make([]byte, 32))

// setValidEnv fija un conjunto completo de variables válidas; cada test
// sobreescribe solo la que le interesa.
func setValidEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db")
	t.Setenv("AUTH_TOKEN_SECRET", "test-secret")
	t.Setenv("SERVER_ADDRESS", "")
	t.Setenv("RESEND_API_KEY", "test-resend-key")
	t.Setenv("RESEND_FROM_ADDRESS", "Moto Routes <no-reply@example.com>")
	t.Setenv("PUBLIC_API_BASE_URL", "https://api.example.com")
	t.Setenv("MINIO_ENDPOINT", "localhost:9000")
	t.Setenv("MINIO_ACCESS_KEY", "test-access-key")
	t.Setenv("MINIO_SECRET_KEY", "test-secret-key")
	t.Setenv("MINIO_BUCKET", "test-bucket")
	t.Setenv("PHOTO_ENCRYPTION_KEY", validPhotoEncryptionKey)
}

func TestLoad_RequiresDatabaseURL(t *testing.T) {
	setValidEnv(t)
	t.Setenv("DATABASE_URL", "")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when DATABASE_URL is not set")
	}
}

func TestLoad_RequiresAuthTokenSecret(t *testing.T) {
	setValidEnv(t)
	t.Setenv("AUTH_TOKEN_SECRET", "")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when AUTH_TOKEN_SECRET is not set")
	}
}

func TestLoad_DefaultsServerAddressTo0000(t *testing.T) {
	setValidEnv(t)

	cfg, err := Load()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.ServerAddress != "0.0.0.0:8080" {
		t.Fatalf("expected default address 0.0.0.0:8080, got %q", cfg.ServerAddress)
	}
}

func TestLoad_UsesConfiguredServerAddress(t *testing.T) {
	setValidEnv(t)
	t.Setenv("SERVER_ADDRESS", "100.64.0.1")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.ServerAddress != "100.64.0.1:8080" {
		t.Fatalf("expected address 100.64.0.1:8080, got %q", cfg.ServerAddress)
	}
}

func TestLoad_RequiresResendAPIKey(t *testing.T) {
	setValidEnv(t)
	t.Setenv("RESEND_API_KEY", "")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when RESEND_API_KEY is not set")
	}
}

func TestLoad_RequiresResendFromAddress(t *testing.T) {
	setValidEnv(t)
	t.Setenv("RESEND_FROM_ADDRESS", "")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when RESEND_FROM_ADDRESS is not set")
	}
}

func TestLoad_RequiresPublicAPIBaseURL(t *testing.T) {
	setValidEnv(t)
	t.Setenv("PUBLIC_API_BASE_URL", "")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when PUBLIC_API_BASE_URL is not set")
	}
}

func TestLoad_RejectsPublicAPIBaseURLWithoutHTTPS(t *testing.T) {
	setValidEnv(t)
	t.Setenv("PUBLIC_API_BASE_URL", "http://100.114.190.36:8080")

	_, err := Load()

	if err == nil {
		t.Fatal("expected an error when PUBLIC_API_BASE_URL does not start with https://")
	}
}

func TestLoad_AcceptsValidPublicAPIBaseURL(t *testing.T) {
	setValidEnv(t)
	t.Setenv("PUBLIC_API_BASE_URL", "https://debian.taildf3dab.ts.net")

	cfg, err := Load()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.PublicAPIBaseURL != "https://debian.taildf3dab.ts.net" {
		t.Fatalf("expected PublicAPIBaseURL to be set verbatim, got %q", cfg.PublicAPIBaseURL)
	}
}

func TestLoad_RequiresMinioEndpoint(t *testing.T) {
	setValidEnv(t)
	t.Setenv("MINIO_ENDPOINT", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when MINIO_ENDPOINT is not set")
	}
}

func TestLoad_RequiresMinioAccessKey(t *testing.T) {
	setValidEnv(t)
	t.Setenv("MINIO_ACCESS_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when MINIO_ACCESS_KEY is not set")
	}
}

func TestLoad_RequiresMinioSecretKey(t *testing.T) {
	setValidEnv(t)
	t.Setenv("MINIO_SECRET_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when MINIO_SECRET_KEY is not set")
	}
}

func TestLoad_RequiresMinioBucket(t *testing.T) {
	setValidEnv(t)
	t.Setenv("MINIO_BUCKET", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when MINIO_BUCKET is not set")
	}
}

func TestLoad_RequiresPhotoEncryptionKey(t *testing.T) {
	setValidEnv(t)
	t.Setenv("PHOTO_ENCRYPTION_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when PHOTO_ENCRYPTION_KEY is not set")
	}
}

func TestLoad_RejectsPhotoEncryptionKeyWithWrongDecodedLength(t *testing.T) {
	setValidEnv(t)
	t.Setenv("PHOTO_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 16)))

	if _, err := Load(); err == nil {
		t.Fatal("expected an error when PHOTO_ENCRYPTION_KEY does not decode to exactly 32 bytes")
	}
}

func TestLoad_DecodesValidPhotoEncryptionKey(t *testing.T) {
	setValidEnv(t)

	cfg, err := Load()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.PhotoEncryptionKey) != 32 {
		t.Fatalf("expected a 32-byte decoded key, got %d bytes", len(cfg.PhotoEncryptionKey))
	}
}
