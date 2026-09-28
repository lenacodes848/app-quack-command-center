import type { ServerResponse } from 'node:http';

/** One published event, as it is kept for replay. */
interface StoredEvent {
  seq: number;
  type: string;
  data: string;
}

interface Subscriber {
  response: ServerResponse;
  owner: string;
}

export interface SubscribeOptions {
  /** Who is listening: the application session, so logging out can end its streams. */
  owner: string;
  /** The browser's `Last-Event-ID` header, when it is reconnecting. */
  lastEventId: string | undefined;
}

export interface EventHub {
  /** Send an event to every subscriber and keep it for replay. Returns its sequence number. */
  publish(type: string, data: unknown): number;
  /** Turn a response into an event stream. The hub owns it from here on. */
  subscribe(response: ServerResponse, options: SubscribeOptions): void;
  /** The sequence number of the latest event, 0 before the first. */
  currentSeq(): number;
  /** End every stream belonging to one application session. */
  closeOwner(owner: string): void;
  /** End every stream. For logging out everywhere, and for shutdown. */
  closeAll(): void;
  subscriberCount(): number;
}

export interface EventHubOptions {
  /** How many recent events a reconnecting client can catch up from. */
  bufferSize?: number | undefined;
  /** How often an idle stream gets a comment, so nothing between gives up on it. */
  heartbeatMs?: number | undefined;
}

/**
 * Past this much unsent data a client is dropped rather than buffered for.
 *
 * A phone on a bad connection can stop reading without closing. Dropping it is
 * safe because it reconnects with `Last-Event-ID` and catches up from the
 * buffer, or is told to resync.
 */
const MAX_UNSENT_BYTES = 1_000_000;

/**
 * One Server-Sent Events stream shared by every agent.
 *
 * Every event carries a sequence number as its SSE id. The browser sends the
 * last one it saw when it reconnects, so a dropped connection resumes exactly
 * where it stopped, while events are still in the buffer. A client further
 * behind than that is sent `resync`, and a new client is sent `hello`; either
 * way it fetches a fresh snapshot, and every snapshot carries the sequence it
 * was taken at, so the client knows which later events to apply.
 */
export function createEventHub(options: EventHubOptions = {}): EventHub {
  const bufferSize = options.bufferSize ?? 2_000;
  const heartbeatMs = options.heartbeatMs ?? 25_000;
  const buffer: StoredEvent[] = [];
  const subscribers = new Set<Subscriber>();
  let seq = 0;

  const frame = (event: StoredEvent): string =>
    `id: ${String(event.seq)}\nevent: ${event.type}\ndata: ${event.data}\n\n`;

  const send = (subscriber: Subscriber, text: string): void => {
    const { response } = subscriber;
    if (response.destroyed) return;
    response.write(text);
    if (response.writableLength > MAX_UNSENT_BYTES) response.destroy();
  };

  const heartbeat = setInterval(() => {
    for (const subscriber of subscribers) send(subscriber, ': ping\n\n');
  }, heartbeatMs);
  // The heartbeat must not keep a stopping server alive.
  heartbeat.unref();

  return {
    publish(type, data) {
      seq += 1;
      const event: StoredEvent = { seq, type, data: JSON.stringify(data) };
      buffer.push(event);
      if (buffer.length > bufferSize) buffer.shift();
      const text = frame(event);
      for (const subscriber of subscribers) send(subscriber, text);
      return seq;
    },

    subscribe(response, { owner, lastEventId }) {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      });
      // Without a listener a write to a dead socket is an unhandled error.
      response.on('error', () => {
        // Nothing to do: the close handler below forgets the subscriber.
      });

      const subscriber: Subscriber = { response, owner };
      subscribers.add(subscriber);
      response.once('close', () => {
        subscribers.delete(subscriber);
      });

      send(subscriber, 'retry: 3000\n\n');

      if (lastEventId === undefined) {
        send(subscriber, `event: hello\ndata: ${JSON.stringify({ seq })}\n\n`);
        return;
      }

      const last = /^\d+$/u.test(lastEventId) ? Number(lastEventId) : Number.NaN;
      const oldest = buffer[0]?.seq ?? seq + 1;
      // Replayable only if nothing between `last` and the buffer has been
      // dropped, and `last` is an id this process actually issued.
      if (Number.isInteger(last) && last <= seq && last >= oldest - 1) {
        for (const event of buffer) {
          if (event.seq > last) send(subscriber, frame(event));
        }
        return;
      }
      send(subscriber, `event: resync\ndata: ${JSON.stringify({ seq })}\n\n`);
    },

    currentSeq: () => seq,

    closeOwner(owner) {
      for (const subscriber of subscribers) {
        if (subscriber.owner === owner) subscriber.response.end();
      }
    },

    closeAll() {
      for (const subscriber of subscribers) subscriber.response.end();
    },

    subscriberCount: () => subscribers.size,
  };
}
