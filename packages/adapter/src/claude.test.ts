import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { buildArgs, parseEventLine, runClaudeTurn, type ClaudeEvent } from './claude.js';

const workspaces: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-adapter-'));
  workspaces.push(dir);
  return dir;
}

/**
 * Write a stand-in for the Claude Code CLI.
 *
 * Every process test runs against this rather than the real binary: the real
 * one spends the owner's subscription quota and needs network, neither of
 * which belongs in a unit test.
 */
function fakeClaude(body: string): string {
  const dir = scratch();
  const path = join(dir, 'fake-claude');
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

async function collect(events: AsyncGenerator<ClaudeEvent>): Promise<ClaudeEvent[]> {
  const out: ClaudeEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

afterAll(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('buildArgs', () => {
  test('a new conversation asks for streaming JSON and does not resume', () => {
    const args = buildArgs({ prompt: 'hello', cwd: '/tmp' });
    expect(args).toEqual(['--print', 'hello', '--output-format', 'stream-json', '--verbose']);
    expect(args).not.toContain('--resume');
  });

  test('an existing conversation resumes by session id', () => {
    const args = buildArgs({ prompt: 'again', cwd: '/tmp', sessionId: 'abc-123' });
    expect(args.slice(-2)).toEqual(['--resume', 'abc-123']);
  });

  test('restricted mode removes the command-running tools', () => {
    expect(buildArgs({ prompt: 'x', cwd: '/tmp', restricted: true })).toContain('--restricted');
    expect(buildArgs({ prompt: 'x', cwd: '/tmp' })).not.toContain('--restricted');
  });

  test('the prompt is passed as one argument, never interpolated into a string', () => {
    // A prompt is untrusted input. If it were ever concatenated into a shell
    // command this argument would break out of it.
    const nasty = '"; rm -rf / #';
    expect(buildArgs({ prompt: nasty, cwd: '/tmp' })).toContain(nasty);
  });
});

describe('parseEventLine', () => {
  test('the init event carries the session id that later turns resume', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'sess-1',
      model: 'claude-opus-5',
    });
    expect(parseEventLine(line)).toEqual([
      { type: 'session', sessionId: 'sess-1', model: 'claude-opus-5' },
    ]);
  });

  test('assistant text becomes text events', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Quack.' }] },
    });
    expect(parseEventLine(line)).toEqual([{ type: 'text', text: 'Quack.' }]);
  });

  test('one message can carry both text and a tool call, in order', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', name: 'Read', input: {} },
        ],
      },
    });
    expect(parseEventLine(line)).toEqual([
      { type: 'text', text: 'Checking.' },
      { type: 'tool', name: 'Read' },
    ]);
  });

  test('a failed result is reported as an error result, not as success', () => {
    const line = JSON.stringify({ type: 'result', result: 'it broke', is_error: true });
    expect(parseEventLine(line)).toEqual([{ type: 'result', text: 'it broke', isError: true }]);
  });

  test.each([
    ['malformed JSON', 'not json at all'],
    ['a blank line', '   '],
    ['an unknown event type', JSON.stringify({ type: 'telemetry', value: 1 })],
    ['an init event with no session id', JSON.stringify({ type: 'system', subtype: 'init' })],
    ['an assistant event with no content', JSON.stringify({ type: 'assistant', message: {} })],
  ])('ignores %s rather than throwing', (_label, line) => {
    expect(parseEventLine(line)).toEqual([]);
  });
});

describe('runClaudeTurn', () => {
  test('streams a whole turn from the CLI output', async () => {
    const binary = fakeClaude(`
      console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-9', model: 'm' }));
      console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } }));
      console.log(JSON.stringify({ type: 'result', result: 'Hi', is_error: false }));
    `);

    expect(await collect(runClaudeTurn({ prompt: 'hi', cwd: scratch(), binary }))).toEqual([
      { type: 'session', sessionId: 's-9', model: 'm' },
      { type: 'text', text: 'Hi' },
      { type: 'result', text: 'Hi', isError: false },
    ]);
  });

  test('a missing binary explains itself instead of throwing', async () => {
    const events = await collect(
      runClaudeTurn({ prompt: 'hi', cwd: scratch(), binary: '/nonexistent/claude' }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error' });
    expect(events[0]).toHaveProperty(
      'message',
      expect.stringContaining('Is Claude Code installed'),
    );
  });

  test('a crash with no result surfaces the CLI stderr', async () => {
    const binary = fakeClaude(`
      console.error('not logged in');
      process.exit(1);
    `);
    const events = await collect(runClaudeTurn({ prompt: 'hi', cwd: scratch(), binary }));
    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty('message', expect.stringContaining('not logged in'));
  });

  test('a non-zero exit AFTER a result is not reported as an error', async () => {
    // The turn produced a usable answer; a messy exit code afterwards must not
    // turn a good reply into a failure in the UI.
    const binary = fakeClaude(`
      console.log(JSON.stringify({ type: 'result', result: 'done', is_error: false }));
      process.exit(3);
    `);
    const events = await collect(runClaudeTurn({ prompt: 'hi', cwd: scratch(), binary }));
    expect(events).toEqual([{ type: 'result', text: 'done', isError: false }]);
  });

  test('junk interleaved with real events does not break the stream', async () => {
    const binary = fakeClaude(`
      console.log('warning: something noisy');
      console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'still here' }] } }));
      console.log('');
      console.log(JSON.stringify({ type: 'result', result: 'ok', is_error: false }));
    `);
    expect(await collect(runClaudeTurn({ prompt: 'hi', cwd: scratch(), binary }))).toEqual([
      { type: 'text', text: 'still here' },
      { type: 'result', text: 'ok', isError: false },
    ]);
  });

  test('runs in the directory it is given, not the server process directory', async () => {
    const dir = scratch();
    const binary = fakeClaude(`
      console.log(JSON.stringify({ type: 'result', result: process.cwd(), is_error: false }));
    `);
    const events = await collect(runClaudeTurn({ prompt: 'where', cwd: dir, binary }));
    const result = events.find((e) => e.type === 'result');
    // macOS reports /private/var for /var, so compare on the trailing segment.
    expect(result).toBeDefined();
    if (result?.type === 'result') expect(result.text).toContain('quack-adapter-');
  });

  test('passes the resume flag through to the process', async () => {
    const binary = fakeClaude(`
      console.log(JSON.stringify({ type: 'result', result: process.argv.slice(2).join(' '), is_error: false }));
    `);
    const events = await collect(
      runClaudeTurn({ prompt: 'again', cwd: scratch(), binary, sessionId: 'resume-me' }),
    );
    const result = events.find((e) => e.type === 'result');
    if (result?.type === 'result') expect(result.text).toContain('--resume resume-me');
  });
});
