import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { createEventHub, type EventHub } from './events.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Received {
  id: string | undefined;
  event: string;
  data: unknown;
}

/** Serve one hub, subscribing each request under the owner named in its `x-owner` header. */
async function serveHub(hub: EventHub): Promise<string> {
  const server: Server = createServer((request, response) => {
    const last = request.headers['last-event-id'];
    hub.subscribe(response, {
      owner: String(request.headers['x-owner'] ?? 'someone'),
      lastEventId: typeof last === 'string' ? last : undefined,
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanups.push(() => {
    hub.closeAll();
    server.close();
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/**
 * Open a stream and collect parsed events until `count` have arrived.
 *
 * Parses the wire format by hand rather than with an EventSource so the test
 * checks the bytes a browser would actually receive.
 */
async function collect(
  base: string,
  count: number,
  headers: Record<string, string> = {},
): Promise<{ events: Received[]; response: Response }> {
  const controller = new AbortController();
  cleanups.push(() => {
    controller.abort();
  });
  const response = await fetch(base, { headers, signal: controller.signal });
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const events: Received[] = [];
  let buffer = '';
  while (events.length < count) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');
      const fields = new Map<string, string>();
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue;
        const at = line.indexOf(': ');
        if (at > 0) fields.set(line.slice(0, at), line.slice(at + 2));
      }
      if (!fields.has('event')) continue;
      events.push({
        id: fields.get('id'),
        event: fields.get('event') ?? '',
        data: JSON.parse(fields.get('data') ?? 'null') as unknown,
      });
    }
  }
  reader.releaseLock();
  return { events, response };
}

describe('the event hub', () => {
  test('sends the stream headers, then a hello carrying the current sequence', async () => {
    const hub = createEventHub();
    hub.publish('agent', { id: 'a' });
    const base = await serveHub(hub);

    const { events, response } = await collect(base, 1);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(events).toEqual([{ id: undefined, event: 'hello', data: { seq: 1 } }]);
  });

  test('numbers every event, and delivers new ones to every subscriber', async () => {
    const hub = createEventHub();
    const base = await serveHub(hub);

    const first = collect(base, 3);
    const second = collect(base, 3);
    await waitFor(() => hub.subscriberCount() === 2);
    hub.publish('agent', { id: 'a' });
    hub.publish('turn', { agentId: 'a', event: { type: 'text', text: 'hi' } });

    for (const { events } of [await first, await second]) {
      expect(events.slice(1)).toEqual([
        { id: '1', event: 'agent', data: { id: 'a' } },
        { id: '2', event: 'turn', data: { agentId: 'a', event: { type: 'text', text: 'hi' } } },
      ]);
    }
  });

  test('replays what a reconnecting client missed, from its Last-Event-ID', async () => {
    const hub = createEventHub();
    for (const n of [1, 2, 3, 4]) hub.publish('agent', { n });
    const base = await serveHub(hub);

    const { events } = await collect(base, 2, { 'last-event-id': '2' });
    expect(events.map((e) => e.data)).toEqual([{ n: 3 }, { n: 4 }]);
    // No hello: a replaying client already has everything before its id.
    expect(events.map((e) => e.event)).toEqual(['agent', 'agent']);
  });

  test('tells a client that has fallen out of the buffer to start again', async () => {
    const hub = createEventHub({ bufferSize: 2 });
    for (const n of [1, 2, 3, 4, 5]) hub.publish('agent', { n });
    const base = await serveHub(hub);

    const { events } = await collect(base, 1, { 'last-event-id': '1' });
    expect(events).toEqual([{ id: undefined, event: 'resync', data: { seq: 5 } }]);
  });

  test('treats a Last-Event-ID from the future as a reason to resync, not to wait', async () => {
    // A server restart resets the sequence, so a browser can hold an id this
    // process has never issued. Waiting for it would show nothing new until the
    // counter caught up.
    const hub = createEventHub();
    hub.publish('agent', { n: 1 });
    const base = await serveHub(hub);

    const { events } = await collect(base, 1, { 'last-event-id': '99' });
    expect(events[0]?.event).toBe('resync');
  });

  test('treats a Last-Event-ID that is not a number as a fresh connection', async () => {
    const hub = createEventHub();
    const base = await serveHub(hub);
    const { events } = await collect(base, 1, { 'last-event-id': 'banana' });
    expect(events[0]?.event).toBe('resync');
  });

  test('closes the streams of one owner, leaving the others open', async () => {
    const hub = createEventHub();
    const base = await serveHub(hub);

    const kept = collect(base, 2, { 'x-owner': 'phone' });
    const closed = collect(base, 2, { 'x-owner': 'laptop' });
    await waitFor(() => hub.subscriberCount() === 2);

    hub.closeOwner('laptop');
    const { events: closedEvents } = await closed;
    expect(closedEvents.map((e) => e.event)).toEqual(['hello']);

    hub.publish('agent', { still: 'here' });
    const { events: keptEvents } = await kept;
    expect(keptEvents[1]?.data).toEqual({ still: 'here' });
    expect(hub.subscriberCount()).toBe(1);
  });

  test('forgets a subscriber whose connection went away', async () => {
    const hub = createEventHub();
    const base = await serveHub(hub);
    const controller = new AbortController();
    await fetch(base, { signal: controller.signal });
    await waitFor(() => hub.subscriberCount() === 1);
    controller.abort();
    await waitFor(() => hub.subscriberCount() === 0);
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition never became true');
}
