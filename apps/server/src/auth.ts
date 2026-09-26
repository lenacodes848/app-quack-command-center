import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';

/** Name of the cookie holding the session token. Not readable by scripts. */
export const SESSION_COOKIE = 'quack_session';
/** Name of the cookie holding the CSRF token. Readable, because the page echoes it. */
export const CSRF_COOKIE = 'quack_csrf';
/** Header the page must echo the CSRF token in. */
export const CSRF_HEADER = 'x-csrf-token';

/** How long a paired device stays paired, at most. Owner's choice. */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** How long a paired device may sit unused before it must pair again. */
export const IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** `last_used_at` is refreshed no more often than this, to avoid a write per request. */
export const TOUCH_INTERVAL_MS = 60 * 1000;

/** How long a pairing code lives. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses before the code is destroyed and attempts are refused. */
export const MAX_PAIRING_ATTEMPTS = 5;
/** How long attempts are refused after that. */
export const PAIRING_LOCKOUT_MS = 15 * 60 * 1000;

/** Characters in a pairing code. */
export const PAIRING_CODE_LENGTH = 10;

/**
 * Crockford base32: the digits and the letters, less I, L, O and U.
 *
 * The excluded four are the ones misread when a code is copied from one screen
 * to another keyboard, which is exactly what this code is for. Ten characters
 * of it is about 50 bits.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type RandomBytes = (size: number) => Buffer;

/** A new pairing code, grouped `XXXX-XXXX-XX` so it can be read aloud. */
export function formatPairingCode(randomBytes: RandomBytes = nodeRandomBytes): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    // Modulo bias is irrelevant here: 256 is a whole multiple of 32, so every
    // character of the alphabet is equally likely.
    out += ALPHABET.charAt((bytes[i] ?? 0) % ALPHABET.length);
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/**
 * Reduce a typed code to its canonical form.
 *
 * Case, spaces and dashes are ignored, and the characters the alphabet leaves
 * out are mapped to the ones they look like, so someone who types the letter O
 * having seen a zero still gets in.
 */
export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/gu, '')
    .replace(/[IL]/gu, '1')
    .replace(/O/gu, '0');
}

/** SHA-256, hex. Used so no token is ever stored in its usable form. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new session token: 32 random bytes, base64url. */
export function generateToken(randomBytes: RandomBytes = nodeRandomBytes): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Compare two strings without revealing where they differ through timing.
 *
 * `timingSafeEqual` throws when the lengths differ, which would turn a wrong
 * guess into a 500 and leak the expected length through the status code. Both
 * sides are hashed first so the comparison is always over equal lengths, and
 * the length itself stops being observable.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

export interface PairingModeOptions {
  now: () => number;
  randomBytes?: RandomBytes | undefined;
}

export type PairingResult = 'ok' | 'mismatch' | 'closed' | 'locked';

export interface PairingMode {
  /** Open pairing for {@link PAIRING_TTL_MS} and return the code to show. */
  open(): string;
  isOpen(): boolean;
  /** When the open code expires, for writing next to it. */
  expiresAt(): number | undefined;
  verify(candidate: string): PairingResult;
  close(): void;
}

/**
 * The pairing window.
 *
 * A code exists only while this is open, so there is never a permanently
 * guessable secret on the port. Failures are counted: at
 * {@link MAX_PAIRING_ATTEMPTS} the code is destroyed and further attempts are
 * refused for {@link PAIRING_LOCKOUT_MS}. Destroying the code matters more than
 * the delay — slowing an attacker down leaves a 50-bit secret guessable,
 * whereas removing it ends the attempt.
 */
export function createPairingMode(options: PairingModeOptions): PairingMode {
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  let codeHash: string | undefined;
  let expires = 0;
  let failures = 0;
  let lockedUntil = 0;

  const isOpen = (): boolean => codeHash !== undefined && options.now() < expires;

  const close = (): void => {
    codeHash = undefined;
    expires = 0;
  };

  return {
    open() {
      const code = formatPairingCode(randomBytes);
      codeHash = hashToken(normalizePairingCode(code));
      expires = options.now() + PAIRING_TTL_MS;
      return code;
    },

    isOpen,

    expiresAt: () => (isOpen() ? expires : undefined),

    verify(candidate) {
      if (options.now() < lockedUntil) return 'locked';
      if (!isOpen()) return 'closed';

      const presented = hashToken(normalizePairingCode(candidate));
      if (constantTimeEquals(presented, codeHash ?? '')) {
        // Single use: a code glimpsed over a shoulder is already spent.
        close();
        failures = 0;
        return 'ok';
      }

      failures += 1;
      if (failures >= MAX_PAIRING_ATTEMPTS) {
        close();
        failures = 0;
        lockedUntil = options.now() + PAIRING_LOCKOUT_MS;
        return 'locked';
      }
      return 'mismatch';
    },

    close,
  };
}

/** Read a `Cookie` header. Never throws; an unreadable header is no cookies. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  if (header === undefined || header === '') return jar;

  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (name === '') continue;
    const raw = part.slice(at + 1).trim();
    try {
      jar.set(name, decodeURIComponent(raw));
    } catch {
      // A value that is not valid percent-encoding is taken literally rather
      // than discarding the whole header.
      jar.set(name, raw);
    }
  }
  return jar;
}

export interface CookieOptions {
  name?: string | undefined;
  httpOnly?: boolean | undefined;
}

/**
 * Build a `Set-Cookie` value.
 *
 * `Secure` is unconditional. Verified against a real browser: a loopback
 * address counts as a trustworthy origin, so `Secure` cookies are honoured over
 * plain `http://127.0.0.1` and the same cookie works unchanged behind HTTPS.
 */
export function buildSessionCookie(
  token: string,
  maxAgeMs: number,
  options: CookieOptions = {},
): string {
  const name = options.name ?? SESSION_COOKIE;
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${String(Math.floor(maxAgeMs / 1000))}`,
    'SameSite=Strict',
    'Secure',
  ];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  return parts.join('; ');
}

/**
 * Whether the address this request arrived on can keep a `Secure` cookie.
 *
 * The session cookie is `Secure`, which is right for the tunnel and costs
 * nothing on loopback — a loopback address counts as a trustworthy origin, so
 * browsers honour it over plain HTTP there, which was verified in a real
 * browser. The case in between is the one a phone hits first: a bare LAN
 * address like `http://192.168.1.20:4317` is *not* trustworthy, so the browser
 * accepts the response and silently discards the cookie. Pairing then appears
 * to succeed and the next request arrives with nothing, bouncing back to the
 * login screen with the single-use code already spent.
 *
 * Answering that case honestly is better than issuing a cookie that cannot
 * stick, so the pairing route checks this first.
 */
export function canHoldSecureCookie(request: {
  host: string | undefined;
  forwardedProto: string | undefined;
}): boolean {
  // A proxy terminating HTTPS is the intended path, and then any host is fine.
  if (request.forwardedProto === 'https') return true;
  if (request.host === undefined || request.host === '') return false;

  // Strip the port, and the brackets around an IPv6 literal.
  const host = request.host
    .replace(/:\d+$/u, '')
    .replace(/^\[|\]$/gu, '')
    .toLowerCase();
  return host === 'localhost' || host === '::1' || host === '127.0.0.1' || /^127\./u.test(host);
}

export interface OriginCheck {
  origin?: string | undefined;
  host?: string | undefined;
  secFetchSite?: string | undefined;
}

/**
 * Whether a state-changing request came from the dashboard itself.
 *
 * A request that proves nothing about its origin is refused rather than assumed
 * safe: `SameSite=Strict` already stops the common cross-site case, and this is
 * the layer that does not depend on the browser honouring it.
 */
export function isSameOrigin(check: OriginCheck): boolean {
  if (check.origin !== undefined && check.origin !== '' && check.origin !== 'null') {
    try {
      return new URL(check.origin).host === check.host;
    } catch {
      return false;
    }
  }
  if (check.secFetchSite !== undefined) return check.secFetchSite === 'same-origin';
  return false;
}

/**
 * Headers set on every response.
 *
 * The content security policy names no inline script. If the built page ever
 * needs one, the answer is a hash for that script, never `unsafe-inline`.
 */
export function securityHeaders(options: { https: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
  // Only over real HTTPS. Sending this on loopback HTTP says nothing, and
  // pinning a scheme the owner is not using would be actively unhelpful.
  if (options.https) headers['strict-transport-security'] = 'max-age=15552000';
  return headers;
}

/**
 * A short, safe name for a paired device.
 *
 * A user agent is attacker-controlled text that the owner will later read in a
 * list, so this keeps a recognised platform name and otherwise falls back,
 * rather than storing whatever was sent.
 */
export function deviceLabel(userAgent: string | undefined): string {
  if (userAgent === undefined || userAgent.trim() === '') return 'Unknown device';

  const known: [RegExp, string][] = [
    [/iPhone/iu, 'iPhone'],
    [/iPad/iu, 'iPad'],
    [/Android/iu, 'Android'],
    [/Macintosh|Mac OS X/iu, 'Mac'],
    [/Windows/iu, 'Windows'],
    [/Linux/iu, 'Linux'],
  ];
  for (const [pattern, name] of known) {
    if (pattern.test(userAgent)) return name;
  }
  const cleaned = userAgent.replace(/[^\w .-]/gu, '').trim();
  return cleaned === '' ? 'Unknown device' : cleaned.slice(0, 40);
}
