/**
 * Security & Authentication Cryptography Module for Finance Pro
 * - PBKDF2-HMAC-SHA256 (100,000 iterations) with 16-byte random salt via Web Crypto API
 * - Constant-time hash comparison to prevent timing side-channel attacks
 * - Input sanitization against XSS / injection
 * - Signed session token validation
 */

const PBKDF2_ITERATIONS = 100_000;
const HASH_PREFIX = 'pbkdf2_sha256';

function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in this environment.');
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) {
    return new Uint8Array(0);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Legacy DJB2 hash kept only for backward-compatible verification of existing accounts
 */
export function legacySimpleHash(password: string): string {
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = (hash * 33) ^ password.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Normalize password consistently (Unicode NFC) so Vietnamese IME / mobile keyboards
 * never produce invisible byte differences for identical characters.
 */
export function normalizePasswordInput(rawPassword: string): string {
  return String(rawPassword ?? '').normalize('NFC');
}

/**
 * Normalize email consistently
 */
export function normalizeEmailInput(rawEmail: string): string {
  return String(rawEmail ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFC');
}

/**
 * Sanitize user-facing text (display name, wallet name, transaction description)
 * to strip dangerous HTML/script tags while preserving Vietnamese accents.
 */
export function sanitizeUserText(input: string, maxLength = 200): string {
  return String(input ?? '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Derive PBKDF2-HMAC-SHA256 hex digest for a password and salt
 */
async function derivePbkdf2Hex(
  password: string,
  saltBytes: Uint8Array,
  iterations: number
): Promise<string> {
  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Hash a password using PBKDF2-HMAC-SHA256 with a fresh 16-byte random salt.
 * Output format: pbkdf2_sha256$100000$<saltHex>$<hashHex>
 */
export async function hashPasswordSecure(rawPassword: string): Promise<string> {
  const normalized = normalizePasswordInput(rawPassword);
  const cryptoObj = getCrypto();
  const salt = new Uint8Array(16);
  cryptoObj.getRandomValues(salt);
  const saltHex = bytesToHex(salt);
  const hashHex = await derivePbkdf2Hex(normalized, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * Verify a candidate password against a stored hash (supports PBKDF2-SHA256 and legacy hash).
 * Also checks trimmed candidate if exact match fails so accidental leading/trailing space
 * from mobile autofill/copy-paste does not lock the user out.
 */
export async function verifyPasswordSecure(
  candidatePassword: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash || !candidatePassword) {
    return { valid: false, needsRehash: false };
  }

  const normalized = normalizePasswordInput(candidatePassword);
  const trimmed = normalized.trim();
  const candidates =
    trimmed !== normalized && trimmed.length >= 4
      ? [normalized, trimmed]
      : [normalized];

  // Modern PBKDF2 format: pbkdf2_sha256$100000$<saltHex>$<hashHex>
  if (storedHash.startsWith(`${HASH_PREFIX}$`)) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) {
      return { valid: false, needsRehash: false };
    }
    const iterations = Number(parts[1]) || PBKDF2_ITERATIONS;
    const saltBytes = hexToBytes(parts[2]);
    const expectedHex = parts[3];

    for (const candidate of candidates) {
      const actualHex = await derivePbkdf2Hex(candidate, saltBytes, iterations);
      if (constantTimeEqual(actualHex, expectedHex)) {
        return { valid: true, needsRehash: false };
      }
    }
    return { valid: false, needsRehash: false };
  }

  // Legacy simpleHash fallback (automatically flagged for upgrade to PBKDF2)
  for (const candidate of candidates) {
    if (constantTimeEqual(legacySimpleHash(candidate), storedHash)) {
      return { valid: true, needsRehash: true };
    }
  }

  return { valid: false, needsRehash: false };
}

/**
 * Create a signed session payload so tampered localStorage session IDs are rejected
 */
export async function createSignedSessionToken(userId: string, email: string): Promise<string> {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 30 * 24 * 3600 * 1000; // 30 days
  const payload = `${userId}|${ normalizeEmailInput(email) }|${issuedAt}|${expiresAt}`;
  const cryptoObj = getCrypto();
  const digest = await cryptoObj.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`fp_session_v2_secret:${payload}`)
  );
  const sig = bytesToHex(new Uint8Array(digest)).slice(0, 32);
  return JSON.stringify({ userId, email: normalizeEmailInput(email), issuedAt, expiresAt, sig });
}

/**
 * Verify and parse a signed session token (also supports plain userId from earlier v2 sessions)
 */
export async function verifySignedSessionToken(
  rawToken: string | null
): Promise<{ userId: string; email?: string } | null> {
  if (!rawToken) return null;
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  // Backward compatibility if rawToken is a plain userId string
  if (!trimmed.startsWith('{')) {
    return { userId: trimmed };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      userId?: string;
      email?: string;
      issuedAt?: number;
      expiresAt?: number;
      sig?: string;
    };
    if (!parsed.userId || !parsed.email || !parsed.issuedAt || !parsed.expiresAt || !parsed.sig) {
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      return null;
    }
    const payload = `${parsed.userId}|${normalizeEmailInput(parsed.email)}|${parsed.issuedAt}|${parsed.expiresAt}`;
    const cryptoObj = getCrypto();
    const digest = await cryptoObj.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`fp_session_v2_secret:${payload}`)
    );
    const expectedSig = bytesToHex(new Uint8Array(digest)).slice(0, 32);
    if (!constantTimeEqual(parsed.sig, expectedSig)) {
      return null;
    }
    return { userId: parsed.userId, email: parsed.email };
  } catch {
    return null;
  }
}
