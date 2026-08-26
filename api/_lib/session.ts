/**
 * session — server-verified Corporate session for the support proxy.
 *
 * Replaces the browser-supplied `demoAccountId` (forgeable: a caller who knew
 * another valid demo account id could impersonate that account, per the P1
 * finding in docs/migration/ggx-corporate-heyq-live-ticketing.md) with a
 * signed, httpOnly, expiring cookie the browser can send but never read,
 * construct, or tamper with. `api/auth/login.ts` is the ONLY place a token is
 * minted (after validating credentials server-side, see `demoUsers.ts`);
 * every other route (`requireSessionIdentity` in `bridge.ts`) only ever
 * VERIFIES a token already on the request.
 *
 * Minimal POC-appropriate mechanism — HMAC-SHA256 signed cookie, no external
 * session store — deliberately the smallest thing that makes identity
 * server-verifiable, not a general-purpose auth system. See the handoff
 * doc's "Server-verified support identity" section for the full boundary.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export class SessionConfigError extends Error {}

export interface SessionRequest {
  headers?: Record<string, string | string[] | undefined>;
}

export interface SessionPayload {
  /** Stable demo user id (matches `DemoUser.id` in demoUsers.ts). */
  sub: string;
  email: string;
  role: 'admin' | 'manager';
  accountId: string;
  accountName: string;
  iat: number;
  exp: number;
}

const COOKIE_NAME = 'ggx_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — POC session lifetime

/**
 * Read + validate `SESSION_SECRET`. Throws `SessionConfigError` when unset —
 * callers must let this propagate to a 500, never silently treat it as "no
 * session" (that would make a missing secret indistinguishable from a normal
 * signed-out caller and harder to diagnose).
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new SessionConfigError(
      'SESSION_SECRET is not set on the server. The support proxy refuses to ' +
      'issue or verify session tokens without it (server-side only; never a ' +
      'VITE_-prefixed variable, never committed).',
    );
  }
  return secret;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** Mint a signed session token. Only ever called from `api/auth/login.ts`
 * after credentials have been verified server-side. */
export function createSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_TTL_SECONDS };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a session token's signature and expiry. Returns the payload, or
 * `null` for anything missing, malformed, tampered, or expired — never
 * partially trusts a token. Throws `SessionConfigError` (not `null`) when
 * `SESSION_SECRET` itself is unset, so a deployment misconfiguration surfaces
 * as a clear 500 rather than a silent "everyone is signed out".
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  const secret = getSecret(); // may throw SessionConfigError — let it propagate
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  return payload;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

function getSessionTokenFromRequest(req: SessionRequest): string | undefined {
  const raw = req?.headers?.['cookie'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return parseCookies(header)[COOKIE_NAME];
}

/** Verify the session cookie on a request. `null` for missing/invalid/expired
 * (fail closed); throws `SessionConfigError` if `SESSION_SECRET` is unset. */
export function readVerifiedSession(req: SessionRequest): SessionPayload | null {
  return verifySessionToken(getSessionTokenFromRequest(req));
}

/** Deployed (Vercel) vs local dev — gates the cookie's `Secure` attribute so
 * local HTTP dev still works while every real deployment is HTTPS-only. */
function isDeployedEnv(): boolean {
  return process.env.VERCEL_ENV !== undefined || process.env.NODE_ENV === 'production';
}

/** `Set-Cookie` value establishing a verified session — httpOnly (never
 * readable or settable by browser JS), signed, expiring. The only way to
 * obtain one is a successful `POST /api/auth/login`. */
export function buildSessionCookie(token: string): string {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_TTL_SECONDS}`];
  if (isDeployedEnv()) attrs.push('Secure');
  return attrs.join('; ');
}

/** `Set-Cookie` value that clears the session (logout). */
export function buildClearedSessionCookie(): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isDeployedEnv()) attrs.push('Secure');
  return attrs.join('; ');
}
