import * as crypto from 'crypto';

// ──────────────────────────────────────────────
// Secret Service
//
// Encryption boundary for sensitive credentials.
// All credential access goes through this service.
//
// Current implementation: AES-256-GCM with env key.
// Fallback: base64 encoding when no key configured
// (dev/test only — logged as warning).
//
// Rules:
// - never log decrypted secrets
// - never return secrets to UI/API responses
// - never include in MCP answers
// - runtime reads through getCredential() only
// ──────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING_PREFIX = 'v1:'; // versioned format

function getEncryptionKey(): Buffer | null {
  const key = process.env.VESTIGIO_SECRET_KEY;
  if (!key) return null;
  // Derive 32-byte key from whatever string is provided
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Production guard: call during startup to ensure secrets are properly configured.
 * Throws in production if VESTIGIO_SECRET_KEY is missing.
 */
export function enforceProductionSecrets(): void {
  if (process.env.NODE_ENV === 'production' && !getEncryptionKey()) {
    throw new Error(
      'VESTIGIO_SECRET_KEY is required in production. ' +
      'Set this environment variable before starting the application.'
    );
  }
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot encrypt: VESTIGIO_SECRET_KEY not configured in production.');
    }
    // Dev/test fallback — base64 only (NOT secure for production)
    return `dev:${Buffer.from(plaintext).toString('base64')}`;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: v1:<iv>:<tag>:<ciphertext> (all base64)
  return `${ENCODING_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(encrypted: string): string {
  if (encrypted.startsWith('dev:')) {
    // Dev/test fallback
    return Buffer.from(encrypted.slice(4), 'base64').toString('utf8');
  }

  if (!encrypted.startsWith(ENCODING_PREFIX)) {
    throw new Error('Unknown encryption format');
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('VESTIGIO_SECRET_KEY not configured — cannot decrypt');
  }

  const parts = encrypted.slice(ENCODING_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Check if a string looks like an encrypted credential */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCODING_PREFIX) || value.startsWith('dev:');
}

/** Returns true if the encryption key is configured (production-grade) */
export function isProductionEncryption(): boolean {
  return getEncryptionKey() !== null;
}
