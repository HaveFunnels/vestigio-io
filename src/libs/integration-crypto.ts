import crypto from "node:crypto";

// ──────────────────────────────────────────────
// AES-256-GCM encryption for integration credentials
//
// Format: base64( IV (12 bytes) + authTag (16 bytes) + ciphertext )
// Key: VESTIGIO_SECRET_KEY env var (or fallback to SECRET), SHA-256 hashed
// to guarantee 32-byte key regardless of raw length.
// ──────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const raw = process.env.VESTIGIO_SECRET_KEY || process.env.SECRET;
  if (!raw) {
    throw new Error(
      "Missing encryption key: set VESTIGIO_SECRET_KEY or SECRET env var",
    );
  }
  // SHA-256 ensures exactly 32 bytes regardless of raw key length
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a config object to a base64 string (AES-256-GCM).
 * The IV and auth tag are prepended so decryption is self-contained.
 */
export function encryptConfig(config: Record<string, string>): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(config);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // IV + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64 string back to a config object.
 */
export function decryptConfig(encoded: string): Record<string, string> {
  const key = deriveKey();
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}
