import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import type { PairingMode, PairingResult } from './auth.js';

export interface PublishPairingCodeOptions {
  pairing: PairingMode;
  /** Where to write the code. Created `0600`, removed when the code dies. */
  path: string;
  /** Where to announce it. The caller decides whether a terminal is watching. */
  print: (line: string) => void;
}

/**
 * Wrap a pairing mode so the code reaches the owner and then disappears.
 *
 * The code is written to a file and announced, and the file is removed the
 * moment the code stops being usable — spent, expired, or destroyed by guessing.
 * A credential-shaped file that no longer means anything is worse than no file,
 * because the next person to find it cannot tell which it is.
 *
 * Every method checks the file against the state of the code rather than relying
 * on a timer, so an expiry that nobody was watching for still tidies up.
 */
export function publishPairingCode(options: PublishPairingCodeOptions): PairingMode {
  const { pairing, path, print } = options;
  let written = false;

  const remove = (): void => {
    if (!written) return;
    written = false;
    try {
      rmSync(path, { force: true });
    } catch {
      // Nothing useful to do: the code is already dead either way.
    }
  };

  /** Drop the file if the code it names is no longer usable. */
  const reconcile = (): void => {
    if (written && !pairing.isOpen()) remove();
  };

  return {
    open() {
      const code = pairing.open();
      try {
        // `mode` on writeFile is masked by the umask, so the file is written and
        // then its permissions are set explicitly.
        writeFileSync(path, `${code}\n`, { encoding: 'utf8', mode: 0o600 });
        chmodSync(path, 0o600);
        written = true;
      } catch {
        // A data directory that cannot be written is not a reason to refuse to
        // start: the owner can still read the code from the terminal.
      }
      print(`Pairing code: ${code}`);
      print(`Also written to ${path} — it expires in ten minutes and can be used once.`);
      return code;
    },

    isOpen() {
      const open = pairing.isOpen();
      if (!open) remove();
      return open;
    },

    expiresAt() {
      reconcile();
      return pairing.expiresAt();
    },

    verify(candidate: string): PairingResult {
      const outcome = pairing.verify(candidate);
      // No special case for 'ok' or 'locked': both leave the code closed, so
      // reconciling against its state covers them. Spelling them out separately
      // was redundancy no test could tell apart.
      reconcile();
      return outcome;
    },

    close() {
      pairing.close();
      remove();
    },
  };
}
