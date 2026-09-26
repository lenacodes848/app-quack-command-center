import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadServerEnv, type ServerEnv } from '@quack/config';
import { PRODUCT_NAME } from '@quack/contracts';
import { openStore } from '@quack/storage';
import { createApp } from './app.js';

export function describeStartup(env: ServerEnv): string {
  return `${PRODUCT_NAME} would listen on http://${env.HOST}:${String(env.PORT)} (${env.NODE_ENV})`;
}

/**
 * Where agent sessions run.
 *
 * A directory under DATA_DIR, never the dashboard's own source tree and never
 * a path a request can choose. Letting the browser name the working directory
 * would hand any caller the whole filesystem.
 */
export function workspaceDir(env: ServerEnv): string {
  return join(env.DATA_DIR, 'workspace');
}

/**
 * Where conversations are stored.
 *
 * Beside the workspace under `DATA_DIR`, so the one directory the owner points
 * at holds everything the dashboard owns and nothing it does not.
 */
export function databasePath(env: ServerEnv): string {
  return join(env.DATA_DIR, 'quack.db');
}

function builtWebDir(): string | undefined {
  // dist/index.js -> apps/server/dist, so the web build is two levels up.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, '..', '..', 'web', 'dist');
  return candidate;
}

/** How long a shutdown waits for open connections before stopping anyway. */
export const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Stop cleanly on Ctrl+C and on SIGTERM.
 *
 * Without this the process is simply killed, the database connection never
 * closes, and the write-ahead log is left to grow across every restart — which
 * is recoverable, but means a "clean" stop is not clean at all.
 *
 * A streaming turn can hold a connection open for minutes, so the wait for
 * connections to drain is bounded. On the forced path the store is still closed
 * first, because checkpointing the log matters more than the socket.
 */
function installShutdown(server: ReturnType<typeof createServer>, closeStore: () => void): void {
  let stopping = false;

  const stop = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    console.log(`${PRODUCT_NAME} stopping (${signal}).`);

    const forced = setTimeout(() => {
      closeStore();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    // Do not let the timer itself hold the process open once everything is shut.
    forced.unref();

    // No closeStore() here: the server's own 'close' event already triggers it,
    // and calling it in both places is redundancy no test can tell apart.
    server.close(() => {
      clearTimeout(forced);
      process.exit(0);
    });
  };

  process.once('SIGINT', () => {
    stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    stop('SIGTERM');
  });
}

export function start(env: ServerEnv): ReturnType<typeof createServer> {
  const workspace = workspaceDir(env);
  mkdirSync(workspace, { recursive: true });

  const store = openStore(databasePath(env));

  const server = createServer(
    createApp({
      workspaceDir: workspace,
      webDir: builtWebDir(),
      runTurn: undefined,
      store,
    }),
  );

  // Closing the store checkpoints the write-ahead log, so a clean stop leaves
  // one tidy database file rather than a -wal beside it. Closing twice throws,
  // so both paths into here go through one guard.
  let storeClosed = false;
  const closeStore = (): void => {
    if (storeClosed) return;
    storeClosed = true;
    store.close();
  };
  server.once('close', closeStore);

  installShutdown(server, closeStore);

  // Without this, a port clash surfaces as an unhandled 'error' event and a
  // raw Node stack trace, which says nothing useful to someone who simply has
  // the dashboard already running in another terminal.
  server.on('error', (failure: NodeJS.ErrnoException) => {
    if (failure.code === 'EADDRINUSE') {
      console.error(
        `Port ${String(env.PORT)} is already in use. ${PRODUCT_NAME} may already be running — stop it, or set PORT to a free port.`,
      );
    } else {
      console.error(`${PRODUCT_NAME} could not start: ${failure.message}`);
    }
    process.exitCode = 1;
    server.close();
  });

  server.listen(env.PORT, env.HOST, () => {
    console.log(`${PRODUCT_NAME} on http://${env.HOST}:${String(env.PORT)}`);
    console.log(`Agent workspace: ${workspace}`);
    console.log(`Conversations: ${databasePath(env)}`);
  });

  return server;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    start(loadServerEnv(process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Configuration failed.');
    process.exit(1);
  }
}
