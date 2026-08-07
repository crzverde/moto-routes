package photos

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// KeySize es la longitud exigida (en bytes, tras decodificar de base64) de
// una clave de cifrado de fotos — AES-256.
const KeySize = 32

// ErrInvalidKeySize indica que la clave decodificada no tiene exactamente KeySize bytes.
var ErrInvalidKeySize = fmt.Errorf("photo encryption key must be exactly %d bytes", KeySize)

// DecodeKey decodifica una clave de cifrado codificada en base64 y valida
// que tenga exactamente KeySize bytes — nunca se trunca ni se rellena en
// silencio una clave con una longitud distinta.
func DecodeKey(encoded string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 photo encryption key: %w", err)
	}
	if len(key) != KeySize {
		return nil, ErrInvalidKeySize
	}
	return key, nil
}

// Encrypt cifra plaintext completo en memoria con AES-256-GCM. El nonce
// (aleatorio, 12 bytes) se antepone al ciphertext devuelto — no es secreto,
// solo debe no repetirse con la misma clave, que GCM exige para su garantía
// de seguridad.
func Encrypt(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt descifra un ciphertext producido por Encrypt con la misma clave.
// Si la clave es distinta o el ciphertext ha sido alterado, GCM rechaza la
// autenticación y devuelve un error — nunca descifra basura en silencio.
func Decrypt(key, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short to contain a nonce")
	}
	nonce, encrypted := ciphertext[:nonceSize], ciphertext[nonceSize:]

	return gcm.Open(nil, nonce, encrypted, nil)
}
