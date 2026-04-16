import { randomBytes } from 'node:crypto';

/** Node-side nonce generator. Edge middleware has its own Web Crypto inline. */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}
