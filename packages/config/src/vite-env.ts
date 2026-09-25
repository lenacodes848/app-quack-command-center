import { ConfigError } from './env.js';

export const PUBLIC_ENV_PREFIX = 'VITE_';

const SECRET_NAME = /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

export function assertNoSecretPublicEnv(env: Readonly<Record<string, string | undefined>>): void {
  const offenders = Object.keys(env).filter(
    (name) => name.startsWith(PUBLIC_ENV_PREFIX) && SECRET_NAME.test(name),
  );
  if (offenders.length === 0) return;
  throw new ConfigError(
    offenders.map(
      (name) =>
        `${name} looks like a secret but ${PUBLIC_ENV_PREFIX} variables are bundled into the browser. Rename it without the prefix and read it on the server only.`,
    ),
  );
}
