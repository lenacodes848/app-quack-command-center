import { useState } from 'react';
import { PRODUCT_NAME } from '@quack/contracts';
import { pair, type PairOutcome } from './api.js';

/** What to tell the owner for each way pairing can fail. */
const MESSAGES: Record<Exclude<PairOutcome, 'paired'>, string> = {
  rejected: 'That code was not accepted. Check it and try again.',
  locked: 'Too many attempts. Wait a few minutes, then start the server again for a new code.',
  unavailable: 'Could not reach the server. Is it still running?',
};

export interface PairingScreenProps {
  /** Called once pairing succeeds, so the app can load itself. */
  onPaired: () => void;
}

/**
 * The login screen.
 *
 * Deliberately says where the code comes from. A box asking for a code is
 * useless to someone who does not know one is printed in the terminal, and this
 * is the first thing a new owner sees.
 */
export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (busy || code.trim() === '') return;
    setBusy(true);
    setProblem(undefined);
    const outcome = await pair(code.trim());
    if (outcome === 'paired') {
      onPaired();
      return;
    }
    setProblem(MESSAGES[outcome]);
    setBusy(false);
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1 text-center">
          <span aria-hidden className="text-3xl">
            🦆
          </span>
          <h1 className="text-base font-semibold">{PRODUCT_NAME}</h1>
          <p className="text-sm text-neutral-400">
            Enter the pairing code from the terminal where you started the server.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500">Pairing code</span>
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            // A code read off another screen: no autocorrect, no capitalisation
            // games, and a keyboard that shows letters and digits together.
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XX"
            aria-label="Pairing code"
            aria-invalid={problem !== undefined}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm tracking-widest outline-none placeholder:text-neutral-600 focus:border-[#F5B301]"
          />
        </label>

        {problem !== undefined && (
          <p role="alert" className="text-sm text-red-400">
            {problem}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.trim() === ''}
          className="rounded bg-[#F5B301] px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          {busy ? 'Pairing…' : 'Pair this device'}
        </button>

        <p className="text-center text-xs text-neutral-600">
          The code can be used once and expires ten minutes after the server printed it. It is also
          written to <code>pairing-code</code> in your data directory.
        </p>
      </form>
    </div>
  );
}
