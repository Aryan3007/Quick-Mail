import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { env } from '../env.js';

const ISSUER = 'quikmail-server';
const AUDIENCE = 'quikmail-desktop';

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = env.DEVICE_TOKEN_SECRET;
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      throw new Error('DEVICE_TOKEN_SECRET must be set in production');
    }
    cachedSecret = new TextEncoder().encode('dev-only-insecure-secret-change-me');
    return cachedSecret;
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export type DeviceClaims = {
  device_id: string;
  platform: string;
};

export async function issueDeviceToken(claims: DeviceClaims): Promise<{ token: string; expiresAt: number }> {
  const ttlSeconds = env.DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ device_id: claims.device_id, platform: claims.platform })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.device_id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
  return { token, expiresAt };
}

export type VerifiedDevice = DeviceClaims & {
  exp: number;
  iat: number;
};

export async function verifyDeviceToken(token: string): Promise<VerifiedDevice> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const claims = payload as JWTPayload & Partial<DeviceClaims>;
  if (typeof claims.device_id !== 'string' || typeof claims.platform !== 'string') {
    throw new Error('Token missing device claims');
  }
  return {
    device_id: claims.device_id,
    platform: claims.platform,
    exp: typeof claims.exp === 'number' ? claims.exp : 0,
    iat: typeof claims.iat === 'number' ? claims.iat : 0,
  };
}
