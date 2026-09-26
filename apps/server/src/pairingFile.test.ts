import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createPairingMode } from './auth.js';
import { publishPairingCode } from './pairingFile.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-code-'));
  dirs.push(dir);
  return dir;
}

function setup(startAt = Date.parse('2026-09-25T12:00:00.000Z')) {
  let clock = startAt;
  const printed: string[] = [];
  const path = join(scratch(), 'pairing-code');
  const pairing = publishPairingCode({
    pairing: createPairingMode({ now: () => clock }),
    path,
    print: (line) => printed.push(line),
  });
  return {
    pairing,
    printed,
    path,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('publishing a pairing code', () => {
  test('writes nothing until pairing is opened', () => {
    const { path } = setup();
    expect(existsSync(path)).toBe(false);
  });

  test('writes the code where the owner can read it', () => {
    const { pairing, path } = setup();
    const code = pairing.open();
    expect(readFileSync(path, 'utf8').trim()).toBe(code);
  });

  test('keeps the file readable only by its owner', () => {
    // It is a credential, briefly. Anyone else on the machine reading it could
    // pair their own browser.
    const { pairing, path } = setup();
    pairing.open();
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test('tells the owner the code and where to find it', () => {
    const { pairing, printed } = setup();
    const code = pairing.open();
    expect(printed.join('\n')).toContain(code);
  });

  test('removes the file as soon as the code is used', () => {
    // A spent code left lying around is a credential-shaped file that no longer
    // means anything, which is worse than no file.
    const { pairing, path } = setup();
    const code = pairing.open();
    expect(pairing.verify(code)).toBe('ok');
    expect(existsSync(path)).toBe(false);
  });

  test('removes the file once the code has expired', () => {
    const { pairing, path, advance } = setup();
    pairing.open();
    advance(11 * 60_000);
    // Any interaction notices the expiry. A stale file must not outlive the code
    // it names.
    expect(pairing.isOpen()).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  test('replaces the file when a new code is issued', () => {
    const { pairing, path } = setup();
    pairing.open();
    const second = pairing.open();
    expect(readFileSync(path, 'utf8').trim()).toBe(second);
  });

  test('leaves the file alone when a wrong code is offered', () => {
    const { pairing, path } = setup();
    pairing.open();
    expect(pairing.verify('ZZZZ-ZZZZ-ZZ')).toBe('mismatch');
    expect(existsSync(path)).toBe(true);
  });

  test('removes the file when guessing trips the lockout', () => {
    const { pairing, path } = setup();
    pairing.open();
    for (let i = 0; i < 5; i += 1) pairing.verify('ZZZZ-ZZZZ-ZZ');
    expect(existsSync(path)).toBe(false);
  });

  test('a file that cannot be written does not stop the server starting', () => {
    // Better a dashboard the owner can still reach through the terminal than no
    // dashboard at all.
    const printed: string[] = [];
    const pairing = publishPairingCode({
      pairing: createPairingMode({ now: () => 0 }),
      path: join(scratch(), 'no-such-directory', 'pairing-code'),
      print: (line) => printed.push(line),
    });
    const code = pairing.open();
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/u);
    expect(printed.join('\n')).toContain(code);
  });
});
