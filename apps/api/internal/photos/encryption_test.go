package photos

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func randomKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, KeySize)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("failed to generate random key: %v", err)
	}
	return key
}

func TestEncryptDecrypt_RoundTripReturnsOriginalPlaintext(t *testing.T) {
	key := randomKey(t)
	plaintext := []byte("these are not really photo bytes, but the algorithm doesn't care")

	ciphertext, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("unexpected error encrypting: %v", err)
	}
	if bytes.Equal(ciphertext, plaintext) {
		t.Fatal("expected ciphertext to differ from plaintext")
	}

	decrypted, err := Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("unexpected error decrypting: %v", err)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Fatalf("expected decrypted plaintext to match original, got %q", decrypted)
	}
}

func TestDecrypt_WithWrongKeyFailsAuthentication(t *testing.T) {
	key := randomKey(t)
	wrongKey := randomKey(t)
	plaintext := []byte("secret route photo bytes")

	ciphertext, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("unexpected error encrypting: %v", err)
	}

	if _, err := Decrypt(wrongKey, ciphertext); err == nil {
		t.Fatal("expected decryption with the wrong key to fail, it silently succeeded")
	}
}

func TestEncrypt_SameKeyProducesDifferentCiphertextEachTime(t *testing.T) {
	key := randomKey(t)
	plaintext := []byte("same plaintext, encrypted twice")

	first, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	second, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if bytes.Equal(first, second) {
		t.Fatal("expected different nonces to produce different ciphertexts for the same plaintext")
	}
}

func TestDecodeKey_ValidBase64ThirtyTwoBytes(t *testing.T) {
	raw := make([]byte, KeySize)
	encoded := base64.StdEncoding.EncodeToString(raw)

	key, err := DecodeKey(encoded)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(key) != KeySize {
		t.Fatalf("expected a %d-byte key, got %d", KeySize, len(key))
	}
}

func TestDecodeKey_RejectsWrongLengthWithoutTruncatingOrPadding(t *testing.T) {
	tooShort := base64.StdEncoding.EncodeToString(make([]byte, KeySize-1))
	tooLong := base64.StdEncoding.EncodeToString(make([]byte, KeySize+1))

	if _, err := DecodeKey(tooShort); err != ErrInvalidKeySize {
		t.Fatalf("expected ErrInvalidKeySize for a short key, got %v", err)
	}
	if _, err := DecodeKey(tooLong); err != ErrInvalidKeySize {
		t.Fatalf("expected ErrInvalidKeySize for a long key, got %v", err)
	}
}

func TestDecodeKey_RejectsInvalidBase64(t *testing.T) {
	if _, err := DecodeKey("not-valid-base64!!!"); err == nil {
		t.Fatal("expected an error for invalid base64 input")
	}
}
