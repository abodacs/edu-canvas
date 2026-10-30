import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const keyBytes = 32;
const nonceBytes = 12;
const versionSeparator = ":";

export interface CredentialCipher {
  readonly keyVersion: string;
  readonly encrypt: (plaintext: string) => string;
  readonly decrypt: (ciphertext: string) => string;
}

export interface CredentialCipherKeys {
  /**
  The active key version, written into new ciphertext.
  */
  readonly keyVersion: string;
  /**
  Base64-encoded 32-byte keys by version. The active key is authoritative.
  */
  readonly keys: Readonly<Record<string, string>>;
}

class CredentialCipherError extends Error {
  name = "CredentialCipherError";
}

const decodeKey = (encoded: string): Uint8Array => {
  const key = Uint8Array.fromBase64(encoded);
  if (key.length !== keyBytes) {
    throw new CredentialCipherError(
      "Credential encryption key must decode to 32 bytes."
    );
  }
  return key;
};

/**
 * Authenticated encryption for provider credentials. Ciphertext carries its key version so rotation can decrypt live sessions with the previous key during a bounded rollout. A missing key invalidates affected sessions rather than falling back to plaintext.
 */
export const createCredentialCipher = (
  keys: CredentialCipherKeys
): CredentialCipher => {
  const keyByVersion = new Map<string, Uint8Array>();
  for (const [version, encoded] of Object.entries(keys.keys)) {
    keyByVersion.set(version, decodeKey(encoded));
  }

  const activeKey = keyByVersion.get(keys.keyVersion);
  if (!activeKey) {
    throw new CredentialCipherError(
      "The active credential key version has no matching key."
    );
  }

  return {
    keyVersion: keys.keyVersion,
    encrypt: (plaintext) => {
      const nonce = randomBytes(nonceBytes);
      const cipher = createCipheriv(algorithm, activeKey, nonce);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf-8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return [
        keys.keyVersion,
        nonce.toBase64({ alphabet: "base64url", omitPadding: true }),
        tag.toBase64({ alphabet: "base64url", omitPadding: true }),
        encrypted.toBase64({ alphabet: "base64url", omitPadding: true }),
      ].join(versionSeparator);
    },
    decrypt: (ciphertext) => {
      const [version, noncePart, tagPart, payloadPart] =
        ciphertext.split(versionSeparator);
      if (!version || !noncePart || !tagPart || payloadPart === undefined) {
        throw new CredentialCipherError("Ciphertext is malformed.");
      }
      const key = keyByVersion.get(version);
      if (!key) {
        throw new CredentialCipherError(
          "No key is available for this ciphertext version."
        );
      }
      const decipher = createDecipheriv(
        algorithm,
        key,
        Uint8Array.fromBase64(noncePart, { alphabet: "base64url" })
      );
      decipher.setAuthTag(
        Uint8Array.fromBase64(tagPart, { alphabet: "base64url" })
      );
      return Buffer.concat([
        decipher.update(
          Uint8Array.fromBase64(payloadPart, { alphabet: "base64url" })
        ),
        decipher.final(),
      ]).toString("utf-8");
    },
  };
};
