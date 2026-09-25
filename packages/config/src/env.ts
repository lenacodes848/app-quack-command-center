import { isAbsolute } from 'node:path';
import { z } from 'zod';

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      error: 'NODE_ENV must be development, test or production.',
    })
    .default('development'),
  HOST: z
    .string()
    .default('127.0.0.1')
    .refine((v) => LOOPBACK_HOSTS.has(v), {
      error:
        'HOST must be a loopback address (127.0.0.1, ::1 or localhost). Remote access goes through a tunnel to loopback, never by binding a public interface.',
    }),
  PORT: z
    .string()
    .default('4317')
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n >= 1024 && n <= 65535, {
      error: 'PORT must be a whole number from 1024 to 65535.',
    }),
  DATA_DIR: z
    .string({
      error: 'DATA_DIR is required. Set it to an absolute directory the service may write to.',
    })
    .refine((v) => isAbsolute(v), { error: 'DATA_DIR must be an absolute path.' }),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'], {
      error: 'LOG_LEVEL must be fatal, error, warn, info, debug or trace.',
    })
    .default('info'),
});

export type ServerEnv = z.infer<typeof schema>;

export function loadServerEnv(raw: Readonly<Record<string, string | undefined>>): ServerEnv {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new ConfigError(result.error.issues.map((issue) => issue.message));
}
