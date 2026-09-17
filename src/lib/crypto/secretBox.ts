import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Key material: one master key (COOKIE_ENCRYPTION_KEY, 32 bytes of hex or
 * base64) is split with HKDF into independent subkeys for encryption and
 * hashing so the same key bytes are never used for both purposes.
 */
export type SecretBox = {
  /** AES-256-GCM encrypt; returns iv || authTag || ciphertext. */
  encrypt(plaintext: string): Buffer;
  /** Decrypts a payload produced by `encrypt`; throws on tampering. */
  decrypt(payload: Uint8Array): string;
  /** Keyed HMAC-SHA256 (lowercased input) for deterministic equality lookups. */
  hash(value: string): string;
};

export function loadEncryptionKey(rawKey: string | undefined): Buffer {
  if (!rawKey || rawKey.trim().length === 0) {
    throw new Error(
      "COOKIE_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32",
    );
  }
  const asHex = Buffer.from(rawKey.trim(), "hex");
  if (asHex.length === KEY_BYTES && /^[0-9a-fA-F]+$/.test(rawKey.trim())) return asHex;
  const asBase64 = Buffer.from(rawKey.trim(), "base64");
  if (asBase64.length === KEY_BYTES) return asBase64;
  throw new Error("COOKIE_ENCRYPTION_KEY must decode to exactly 32 bytes (hex or base64)");
}

function deriveSubkey(master: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.from("substackengine"), Buffer.from(info), KEY_BYTES));
}

export function createSecretBox(masterKey: Buffer): SecretBox {
  const encKey = deriveSubkey(masterKey, "cookie-encryption");
  const hashKey = deriveSubkey(masterKey, "email-hash");

  return {
    encrypt(plaintext: string): Buffer {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, encKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },

    decrypt(payload: Uint8Array): string {
      if (payload.length < IV_BYTES + TAG_BYTES) {
        throw new Error("encrypted payload is truncated");
      }
      const bytes = Buffer.from(payload);
      const iv = bytes.subarray(0, IV_BYTES);
      const authTag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const ciphertext = bytes.subarray(IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, encKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    },

    hash(value: string): string {
      return createHmac("sha256", hashKey).update(value.trim().toLowerCase()).digest("hex");
    },
  };
}
