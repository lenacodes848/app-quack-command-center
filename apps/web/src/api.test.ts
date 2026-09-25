import { describe, expect, test } from 'vitest';
import { parseTurnEvent, toLines } from './api.js';

async function* chunks(...values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    // Yield to the event loop between chunks, so the splitter is exercised
    // the way a real network stream delivers them rather than all at once.
    await Promise.resolve();
    yield value;
  }
}

async function collect(lines: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

describe('toLines', () => {
  test('splits a single chunk into its lines', async () => {
    expect(await collect(toLines(chunks('a\nb\nc\n')))).toEqual(['a', 'b', 'c']);
  });

  test('reassembles a line split across chunk boundaries', async () => {
    // The whole reason this function exists: the network decides where chunks
    // break, and a naive split would lose or corrupt the event here.
    expect(await collect(toLines(chunks('{"ty', 'pe":"te', 'xt"}\n')))).toEqual([
      '{"type":"text"}',
    ]);
  });

  test('emits a trailing line that never got its newline', async () => {
    expect(await collect(toLines(chunks('first\nsecond')))).toEqual(['first', 'second']);
  });

  test('handles several lines arriving in one chunk after a partial one', async () => {
    expect(await collect(toLines(chunks('one', '\ntwo\nthree\n')))).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  test('ignores a trailing chunk that is only whitespace', async () => {
    expect(await collect(toLines(chunks('done\n', '  ')))).toEqual(['done']);
  });
});

describe('parseTurnEvent', () => {
  test('parses a text event', () => {
    expect(parseTurnEvent('{"type":"text","text":"hi"}')).toEqual({ type: 'text', text: 'hi' });
  });

  test.each([
    ['malformed JSON', '{oops'],
    ['an empty line', '   '],
    ['a JSON value that is not an object', '42'],
    ['null', 'null'],
    ['an object with no type', '{"text":"hi"}'],
  ])('returns undefined for %s', (_label, line) => {
    expect(parseTurnEvent(line)).toBeUndefined();
  });
});
