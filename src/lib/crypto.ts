// src/lib/crypto.ts
// Cloudflare Worker / Web Crypto API compatible authentication and hashing utilities

const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGORITHM = 'SHA-256';

/**
 * Generate a cryptographically secure random hexadecimal string
 */
export function generateRandomHex(byteLength: number = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes SHA-256 hex digest for a string or buffer
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as any);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password using PBKDF2-HMAC-SHA256
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM
    },
    keyMaterial,
    256 // 256 bits = 32 bytes
  );

  const hashArray = Array.from(new Uint8Array(derivedKey));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a plain text password against stored hash and salt
 */
export async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Sign a payload with HMAC-SHA256 to create a secure session token
 */
export async function signSessionToken(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const b64UrlEncode = (obj: object | Uint8Array): string => {
    let str = '';
    if (obj instanceof Uint8Array) {
      str = String.fromCharCode(...obj);
    } else {
      str = JSON.stringify(obj);
    }
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };

  const encodedHeader = b64UrlEncode(header);
  const encodedPayload = b64UrlEncode(payload);
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'sarkari-portal-insecure-default-secret-change-me'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(dataToSign)
  );

  const encodedSignature = b64UrlEncode(new Uint8Array(signature));
  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verify and decode an HMAC-SHA256 session token
 */
export async function verifySessionToken<T = any>(token: string, secret: string): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret || 'sarkari-portal-insecure-default-secret-change-me'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode base64url signature back to bytes
    const binStr = atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/'));
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      sigBytes[i] = binStr.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(dataToVerify)
    );

    if (!isValid) return null;

    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(payloadJson) as T & { exp?: number };

    // Check expiration if present
    if (parsed.exp && Date.now() >= parsed.exp * 1000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
