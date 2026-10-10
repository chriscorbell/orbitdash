import {
  AUTH_MODES,
  GUEST_ACCESS,
  MAX_PASSWORD_LENGTH,
  type AuthMode,
  type GuestAccess,
} from "@shared/auth";
import { InvalidIpEntryError, parseIpList, type IpMatcher } from "./ip";

/** A configuration orbitdash refuses to start with; the message says what to change. */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export interface AuthConfig {
  guest: GuestAccess;
  mode: AuthMode;
  /** Password mode, from `ORBITDASH_PASSWORD`; hashed once the database is open. */
  password: string | null;
  /** Password mode, from `ORBITDASH_PASSWORD_HASH`: an argon2 hash. */
  passwordHash: string | null;
  /** Proxy mode: the request header that names the user, lower-cased. */
  proxyHeader: string;
  sessionTtlMs: number;
  /** Proxies allowed to set the user header, X-Forwarded-For and X-Forwarded-Proto. */
  trustedProxies: IpMatcher;
}

export const DEFAULT_PROXY_HEADER = "Remote-User";
export const DEFAULT_SESSION_DAYS = 30;
// Browsers cap cookie lifetimes at 400 days.
const MAX_SESSION_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const ARGON2_HASH_PATTERN =
  /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const HASH_COMMAND = "bun server/cli/hash-password.ts";

type Env = Record<string, string | undefined>;

function readTrimmed(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function readChoice<T extends string>(
  env: Env,
  name: string,
  choices: readonly T[],
  fallback: T
): T {
  const value = readTrimmed(env, name)?.toLowerCase();
  if (value === undefined) return fallback;
  if (!(choices as readonly string[]).includes(value)) {
    throw new AuthConfigError(
      `${name} must be one of ${choices.join(", ")} (got "${env[name]?.trim()}")`
    );
  }
  return value as T;
}

function readSessionDays(env: Env): number {
  const raw = readTrimmed(env, "ORBITDASH_SESSION_DAYS");
  if (raw === null) return DEFAULT_SESSION_DAYS;
  const days = Number(raw);
  if (!/^\d+$/.test(raw) || days < 1 || days > MAX_SESSION_DAYS) {
    throw new AuthConfigError(
      `ORBITDASH_SESSION_DAYS must be a whole number from 1 to ${MAX_SESSION_DAYS} (got "${raw}")`
    );
  }
  return days;
}

function readTrustedProxies(env: Env): IpMatcher {
  try {
    return parseIpList(env.ORBITDASH_TRUSTED_PROXIES ?? "");
  } catch (error) {
    if (error instanceof InvalidIpEntryError) {
      throw new AuthConfigError(`ORBITDASH_TRUSTED_PROXIES: ${error.message}`);
    }
    throw error;
  }
}

function readProxyHeader(env: Env): string {
  const header = readTrimmed(env, "ORBITDASH_PROXY_HEADER") ?? DEFAULT_PROXY_HEADER;
  if (!HEADER_NAME_PATTERN.test(header)) {
    throw new AuthConfigError(
      `ORBITDASH_PROXY_HEADER is not a valid header name (got "${header}")`
    );
  }
  return header.toLowerCase();
}

function validatePasswordHash(hash: string): void {
  if (!ARGON2_HASH_PATTERN.test(hash)) {
    throw new AuthConfigError(
      `ORBITDASH_PASSWORD_HASH must be an argon2 hash starting with $argon2id$; create one with \`${HASH_COMMAND}\`. In docker-compose.yml, write every $ in it as $$.`
    );
  }

  try {
    Bun.password.verifySync("orbitdash-config-check", hash);
  } catch {
    throw new AuthConfigError("ORBITDASH_PASSWORD_HASH could not be read as an argon2 hash");
  }
}

/**
 * Reads the auth settings from the environment, and throws AuthConfigError for anything that is
 * missing, malformed, or likely a mistake (a password set while auth is off would leave the
 * dashboard open to someone who thinks it is protected).
 */
export function parseAuthConfig(env: Env = process.env): AuthConfig {
  const mode = readChoice(env, "ORBITDASH_AUTH", AUTH_MODES, "none");
  const guest = readChoice(env, "ORBITDASH_GUEST", GUEST_ACCESS, "none");
  // A password is used exactly as given; only an empty value counts as unset.
  const password = env.ORBITDASH_PASSWORD ? env.ORBITDASH_PASSWORD : null;
  const passwordHash = readTrimmed(env, "ORBITDASH_PASSWORD_HASH");
  const trustedProxies = readTrustedProxies(env);
  const proxyHeader = readProxyHeader(env);
  const sessionTtlMs = readSessionDays(env) * DAY_MS;

  if (mode !== "password" && (password !== null || passwordHash !== null)) {
    const name = password !== null ? "ORBITDASH_PASSWORD" : "ORBITDASH_PASSWORD_HASH";
    throw new AuthConfigError(
      `${name} is set but ORBITDASH_AUTH is "${mode}"; set ORBITDASH_AUTH=password to require the password, or remove ${name}`
    );
  }

  if (mode === "none" && guest !== "none") {
    throw new AuthConfigError(
      "ORBITDASH_GUEST=view needs ORBITDASH_AUTH=password or ORBITDASH_AUTH=proxy; with auth off everyone can already edit"
    );
  }

  if (mode === "password") {
    if (password !== null && passwordHash !== null) {
      throw new AuthConfigError("set ORBITDASH_PASSWORD or ORBITDASH_PASSWORD_HASH, not both");
    }
    if (password === null && passwordHash === null) {
      throw new AuthConfigError(
        `ORBITDASH_AUTH=password needs ORBITDASH_PASSWORD or ORBITDASH_PASSWORD_HASH (create a hash with \`${HASH_COMMAND}\`)`
      );
    }
    if (password !== null && password.length > MAX_PASSWORD_LENGTH) {
      throw new AuthConfigError(
        `ORBITDASH_PASSWORD must be at most ${MAX_PASSWORD_LENGTH} characters`
      );
    }
    if (passwordHash !== null) validatePasswordHash(passwordHash);
  }

  if (mode === "proxy" && trustedProxies.isEmpty) {
    throw new AuthConfigError(
      "ORBITDASH_AUTH=proxy needs ORBITDASH_TRUSTED_PROXIES: the IPs or CIDR ranges of the reverse proxies allowed to set the user header"
    );
  }

  return { guest, mode, password, passwordHash, proxyHeader, sessionTtlMs, trustedProxies };
}
