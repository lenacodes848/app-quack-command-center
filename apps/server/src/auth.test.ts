import { describe, expect, test } from 'vitest';
import {
  buildSessionCookie,
  constantTimeEquals,
  createPairingMode,
  CSRF_COOKIE,
  deviceLabel,
  formatPairingCode,
  hashToken,
  isSameOrigin,
  MAX_PAIRING_ATTEMPTS,
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
  parseCookies,
  securityHeaders,
  SESSION_COOKIE,
} from './auth.js';

/** Bytes a test can predict, standing in for crypto.randomBytes. */
function fixedRandom(fill: number): (size: number) => Buffer {
  return (size) => Buffer.alloc(size, fill);
}

function countingRandom(): (size: number) => Buffer {
  let n = 0;
  return (size) => Buffer.alloc(size, n++);
}

const MINUTE = 60_000;
const T0 = Date.parse('2026-09-25T12:00:00.000Z');
/**
 * A code the fixture can never generate.
 *
 * countingRandom fills each byte with 0, then 1, and so on, so the codes it
 * produces are all-'0', all-'1' and upward. A guess of all-'Z' is therefore
 * guaranteed wrong — the first draft of these tests guessed all-'0' and
 * accidentally guessed the real code.
 */
const WRONG = 'ZZZZ-ZZZZ-ZZ';

describe('the pairing code', () => {
  test('uses an alphabet with no characters that can be misread', () => {
    // It gets read off one screen and typed on another, so I, L, O and U are
    // absent: they are the ones confused with 1, 0 and each other.
    const code = normalizePairingCode(formatPairingCode(countingRandom()));
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/u);
    expect(code).toHaveLength(PAIRING_CODE_LENGTH);
  });

  test('is grouped so a person can read it aloud', () => {
    expect(formatPairingCode(fixedRandom(0))).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/u);
  });

  test('forgives how the code is typed back', () => {
    // Lower case, missing dashes and stray spaces are all the same code. The
    // characters the alphabet omits are mapped to what they look like, so
    // someone who types a letter O gets the zero they saw.
    const canonical = normalizePairingCode('7H2K-9QMR-4B');
    expect(normalizePairingCode('7h2k9qmr4b')).toBe(canonical);
    expect(normalizePairingCode('  7H2K 9QMR 4B  ')).toBe(canonical);
    expect(normalizePairingCode('O7H2K-9QMR-4B')).toBe(`0${canonical}`);
    expect(normalizePairingCode('l7H2K-9QMR-4B')).toBe(`1${canonical}`);
  });

  test('differs between calls', () => {
    const random = countingRandom();
    expect(formatPairingCode(random)).not.toBe(formatPairingCode(random));
  });
});

describe('pairing mode', () => {
  function mode(startAt = T0) {
    let clock = startAt;
    const pairing = createPairingMode({
      now: () => clock,
      randomBytes: countingRandom(),
    });
    return {
      pairing,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  test('is closed until it is opened, and rejects everything while closed', () => {
    // There is never a permanently guessable code sitting on the port.
    const { pairing } = mode();
    expect(pairing.isOpen()).toBe(false);
    expect(pairing.verify('anything')).toBe('closed');
  });

  test('accepts the code it issued', () => {
    const { pairing } = mode();
    const code = pairing.open();
    expect(pairing.isOpen()).toBe(true);
    expect(pairing.verify(code)).toBe('ok');
  });

  test('accepts the code however it was typed', () => {
    const { pairing } = mode();
    const code = pairing.open();
    expect(pairing.verify(code.toLowerCase().replace(/-/gu, ' '))).toBe('ok');
  });

  test('a code works once and never again', () => {
    // Single use, so a code seen over someone's shoulder is already spent.
    const { pairing } = mode();
    const code = pairing.open();
    expect(pairing.verify(code)).toBe('ok');
    expect(pairing.verify(code)).toBe('closed');
    expect(pairing.isOpen()).toBe(false);
  });

  test('expires, and the expired code stops working', () => {
    const { pairing, advance } = mode();
    const code = pairing.open();
    advance(11 * MINUTE);
    expect(pairing.isOpen()).toBe(false);
    expect(pairing.verify(code)).toBe('closed');
  });

  test('a wrong code is a mismatch, not a crash', () => {
    const { pairing } = mode();
    pairing.open();
    expect(pairing.verify(WRONG)).toBe('mismatch');
  });

  test('five wrong guesses destroy the code outright', () => {
    // A 50-bit secret does not need a delay, it needs the target to disappear.
    // Slowing an attacker down still leaves the code guessable; removing it does
    // not.
    const { pairing } = mode();
    const code = pairing.open();
    for (let i = 0; i < MAX_PAIRING_ATTEMPTS - 1; i += 1) {
      expect(pairing.verify(WRONG)).toBe('mismatch');
    }
    expect(pairing.verify(WRONG)).toBe('locked');

    // The real code is gone too, not merely rate limited.
    expect(pairing.isOpen()).toBe(false);
    expect(pairing.verify(code)).toBe('locked');
  });

  test('a lockout ends, so a mistyped code is not permanent', () => {
    const { pairing, advance } = mode();
    pairing.open();
    for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i += 1) pairing.verify(WRONG);
    expect(pairing.verify(WRONG)).toBe('locked');

    advance(16 * MINUTE);
    const fresh = pairing.open();
    expect(pairing.verify(fresh)).toBe('ok');
  });

  test('a correct code clears the failures behind it', () => {
    const { pairing } = mode();
    const first = pairing.open();
    pairing.verify(WRONG);
    pairing.verify(WRONG);
    expect(pairing.verify(first)).toBe('ok');

    // Four more failures must not trip the limit, because the counter reset.
    const second = pairing.open();
    for (let i = 0; i < MAX_PAIRING_ATTEMPTS - 1; i += 1) pairing.verify(WRONG);
    expect(pairing.verify(second)).toBe('ok');
  });

  test('reopening replaces the previous code', () => {
    const { pairing } = mode();
    const first = pairing.open();
    const second = pairing.open();
    expect(second).not.toBe(first);
    expect(pairing.verify(first)).toBe('mismatch');
    expect(pairing.verify(second)).toBe('ok');
  });
});

describe('tokens', () => {
  test('a hash does not reveal what it was made from', () => {
    expect(hashToken('a-secret-token')).not.toContain('a-secret-token');
    expect(hashToken('a-secret-token')).toMatch(/^[0-9a-f]{64}$/u);
  });

  test('the same token always hashes the same way, and different ones do not', () => {
    expect(hashToken('one')).toBe(hashToken('one'));
    expect(hashToken('one')).not.toBe(hashToken('two'));
  });
});

describe('constantTimeEquals', () => {
  test('matches equal strings and rejects different ones', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
  });

  test('handles different lengths without throwing', () => {
    // timingSafeEqual throws on a length mismatch, which would turn a wrong
    // guess into a 500 and leak the length through the status code.
    expect(constantTimeEquals('abc', 'abcdef')).toBe(false);
    expect(constantTimeEquals('', 'a')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('cookies', () => {
  test('reads several cookies from one header', () => {
    const jar = parseCookies('quack_session=abc; quack_csrf=def');
    expect(jar.get('quack_session')).toBe('abc');
    expect(jar.get('quack_csrf')).toBe('def');
  });

  test('copes with an absent or malformed header', () => {
    expect(parseCookies(undefined).size).toBe(0);
    expect(parseCookies('').size).toBe(0);
    expect(parseCookies('nonsense').size).toBe(0);
    expect(parseCookies('a=1; ; b=2').get('b')).toBe('2');
  });

  test('decodes a percent-encoded value', () => {
    expect(parseCookies('x=a%20b').get('x')).toBe('a b');
  });

  test('the session cookie cannot be read by scripts or sent across sites', () => {
    const cookie = buildSessionCookie('the-token', 1_234_000);
    expect(cookie).toContain(`${SESSION_COOKIE}=the-token`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    // Verified against a real browser: Secure cookies are honoured on loopback,
    // so this costs nothing locally and is required once behind a tunnel.
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=1234');
  });

  test('clearing the session cookie expires it immediately', () => {
    expect(buildSessionCookie('', 0)).toContain('Max-Age=0');
  });

  test('the CSRF cookie is readable by scripts, because the page must echo it', () => {
    const cookie = buildSessionCookie('t', 1000, { name: CSRF_COOKIE, httpOnly: false });
    expect(cookie).not.toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });
});

describe('isSameOrigin', () => {
  test('accepts a request whose Origin matches the host it arrived on', () => {
    expect(isSameOrigin({ origin: 'http://127.0.0.1:4317', host: '127.0.0.1:4317' })).toBe(true);
  });

  test('rejects a request from another site', () => {
    // The CSRF case: a page elsewhere posting to the dashboard.
    expect(isSameOrigin({ origin: 'https://evil.example', host: '127.0.0.1:4317' })).toBe(false);
  });

  test('accepts an https Origin behind a tunnel', () => {
    expect(isSameOrigin({ origin: 'https://quack.example', host: 'quack.example' })).toBe(true);
  });

  test('falls back to Sec-Fetch-Site when there is no Origin', () => {
    // Some same-origin requests send no Origin header at all.
    expect(isSameOrigin({ host: 'h', secFetchSite: 'same-origin' })).toBe(true);
    expect(isSameOrigin({ host: 'h', secFetchSite: 'cross-site' })).toBe(false);
  });

  test('rejects a request that proves nothing about where it came from', () => {
    // No Origin and no Sec-Fetch-Site: refuse rather than assume.
    expect(isSameOrigin({ host: 'h' })).toBe(false);
  });

  test('rejects a malformed Origin instead of throwing', () => {
    expect(isSameOrigin({ origin: 'not a url', host: 'h' })).toBe(false);
  });
});

describe('securityHeaders', () => {
  test('forbid inline script, framing, and sending the URL onward', () => {
    const headers = securityHeaders({ https: false });
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  test('only claim HTTPS when the request actually arrived over it', () => {
    // Sending HSTS over loopback HTTP is meaningless, and pinning a scheme the
    // owner is not using would be worse than meaningless.
    expect(securityHeaders({ https: false })['strict-transport-security']).toBeUndefined();
    expect(securityHeaders({ https: true })['strict-transport-security']).toContain('max-age=');
  });
});

describe('deviceLabel', () => {
  test('summarises a browser so the owner can tell their devices apart', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')).toBe(
      'iPhone',
    );
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0')).toBe('Mac');
  });

  test('never stores an unbounded or unknown string', () => {
    // A user agent is attacker-controlled text that the owner will later read.
    const label = deviceLabel('x'.repeat(500));
    expect(label.length).toBeLessThanOrEqual(40);
    expect(deviceLabel(undefined)).toBe('Unknown device');
  });

  test('strips anything that is not plain text', () => {
    expect(deviceLabel('<script>alert(1)</script> iPhone')).not.toContain('<');
  });
});
