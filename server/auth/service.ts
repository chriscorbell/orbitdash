import type { Database } from "bun:sqlite";
import { createHash } from "crypto";
import type { AuthSession } from "@shared/auth";
import { getDb } from "../db";
import { DEFAULT_PROXY_HEADER, DEFAULT_SESSION_DAYS, type AuthConfig } from "./config";
import { parseIpList } from "./ip";
import { createLoginRateLimiter, type LoginRateLimiter } from "./rate-limit";
import { createSession, deleteSession, purgeSessions, verifySession } from "./sessions";

/** Password mode has one shared password, so every session belongs to this user. */
export const PASSWORD_USER = "admin";
const STORED_HASH_KEY = "password_hash";
const MAX_PROXY_USER_LENGTH = 256;
// Stands in for an empty password so it costs a full argon2 check too.
const EMPTY_PASSWORD_STAND_IN = "\u0000orbitdash-empty-password";

export const OPEN_AUTH_CONFIG: AuthConfig = {
  guest: "none",
  mode: "none",
  password: null,
  passwordHash: null,
  proxyHeader: DEFAULT_PROXY_HEADER.toLowerCase(),
  sessionTtlMs: DEFAULT_SESSION_DAYS * 24 * 60 * 60 * 1000,
  trustedProxies: parseIpList(""),
};

interface PasswordCredential {
  /** Stored with each session; a different password gives a different fingerprint. */
  fingerprint: string;
  hash: string;
}

interface AuthState {
  config: AuthConfig;
  credential: PasswordCredential | null;
  limiter: LoginRateLimiter;
}

function createState(config: AuthConfig, credential: PasswordCredential | null): AuthState {
  return { config, credential, limiter: createLoginRateLimiter() };
}

let state = createState(OPEN_AUTH_CONFIG, null);

function toCredential(hash: string): PasswordCredential {
  return { fingerprint: createHash("sha256").update(hash).digest("base64url"), hash };
}

function verifiesSync(password: string, hash: string): boolean {
  try {
    return Bun.password.verifySync(password, hash);
  } catch {
    return false;
  }
}

/**
 * The hash sign-ins are checked against. A plain ORBITDASH_PASSWORD is hashed with argon2id and
 * the hash kept in auth_state; while the password still matches it, the same hash (and so the
 * same fingerprint) is reused, which keeps sessions alive across restarts. A new password gets a
 * new hash, which ends every older session.
 */
export function resolvePasswordCredential(
  config: AuthConfig,
  db: Database
): PasswordCredential | null {
  if (config.mode !== "password") return null;
  if (config.passwordHash !== null) return toCredential(config.passwordHash);
  if (config.password === null) return null;

  const stored = db.prepare("SELECT value FROM auth_state WHERE key = ?").get(STORED_HASH_KEY) as {
    value: string;
  } | null;
  if (stored && verifiesSync(config.password, stored.value)) {
    return toCredential(stored.value);
  }

  const hash = Bun.password.hashSync(config.password, { algorithm: "argon2id" });
  db.prepare(
    `INSERT INTO auth_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(STORED_HASH_KEY, hash);
  return toCredential(hash);
}

/** Applies a parsed config. The plain password is dropped once it has been hashed. */
export function configureAuth(config: AuthConfig, db: Database): void {
  const credential = resolvePasswordCredential(config, db);
  state = createState({ ...config, password: null }, credential);
}

/** Back to auth `none`, e.g. on shutdown. */
export function resetAuth(): void {
  state = createState(OPEN_AUTH_CONFIG, null);
}

export function getAuthConfig(): AuthConfig {
  return state.config;
}

export type AccessLevel = "edit" | "view" | "none";

export interface ActiveSession {
  expiresAt: number;
  /** The expiry just slid, so the cookie should be sent again with the new lifetime. */
  refreshed: boolean;
  token: string;
}

export interface RequestIdentity {
  access: AccessLevel;
  /** Password mode: the session behind the request, so logout can end it. */
  session: ActiveSession | null;
  user: string | null;
}

export interface IdentityInput {
  now: number;
  /** The socket peer's address, never a header. */
  peerIp: string | null;
  /** The configured proxy header's value, if the request has it. */
  proxyUser: string | null | undefined;
  sessionToken: string | undefined;
}

function readProxyUser(value: string | null | undefined): string | null {
  const user = value?.trim();
  // eslint-disable-next-line no-control-regex
  if (!user || user.length > MAX_PROXY_USER_LENGTH || /[\u0000-\u001f\u007f]/.test(user)) {
    return null;
  }
  return user;
}

/** Who a request acts as: full access, guest access, or none. */
export function resolveIdentity(input: IdentityInput): RequestIdentity {
  const { config, credential } = state;
  if (config.mode === "none") {
    return { access: "edit", session: null, user: null };
  }

  const anonymous: RequestIdentity = {
    access: config.guest === "view" ? "view" : "none",
    session: null,
    user: null,
  };

  if (config.mode === "proxy") {
    // The header only means something when a trusted proxy set it; from anyone else it's ignored.
    const user = config.trustedProxies.matches(input.peerIp)
      ? readProxyUser(input.proxyUser)
      : null;
    return user ? { access: "edit", session: null, user } : anonymous;
  }

  if (!credential || !input.sessionToken) return anonymous;
  const verified = verifySession(getDb(), input.sessionToken, {
    credential: credential.fingerprint,
    now: input.now,
    ttlMs: config.sessionTtlMs,
  });
  if (!verified) return anonymous;

  return {
    access: "edit",
    session: {
      expiresAt: verified.expiresAt,
      refreshed: verified.refreshed,
      token: input.sessionToken,
    },
    user: verified.user,
  };
}

export function describeSession(identity: RequestIdentity): AuthSession {
  return {
    authenticated: identity.user !== null,
    canEdit: identity.access === "edit",
    guest: state.config.guest,
    mode: state.config.mode,
    user: identity.user,
  };
}

/** True while a session is still valid; checks without sliding its expiry. */
export function isSessionActive(token: string, now: number): boolean {
  const { config, credential } = state;
  if (config.mode !== "password" || !credential) return false;
  return (
    verifySession(
      getDb(),
      token,
      { credential: credential.fingerprint, now, ttlMs: config.sessionTtlMs },
      { slide: false }
    ) !== null
  );
}

export type LoginResult =
  | { ok: true; expiresAt: number; token: string }
  | { ok: false; reason: "disabled" | "invalid" }
  | { ok: false; reason: "rate-limited"; retryAfterMs: number };

/**
 * Checks a password for `clientKey` (the client's IP). The attempt counts as a failure before the
 * slow argon2 check runs, so parallel guesses can't all slip under the limit; a match clears it.
 */
export async function attemptLogin(
  password: string,
  clientKey: string,
  now: number
): Promise<LoginResult> {
  const { config, credential, limiter } = state;
  if (config.mode !== "password" || !credential) {
    return { ok: false, reason: "disabled" };
  }

  const decision = limiter.check(clientKey, now);
  if (!decision.allowed) {
    return { ok: false, reason: "rate-limited", retryAfterMs: decision.retryAfterMs };
  }

  limiter.recordFailure(clientKey, now);
  const matched =
    (await Bun.password.verify(password || EMPTY_PASSWORD_STAND_IN, credential.hash)) &&
    password !== "";
  if (!matched) {
    return { ok: false, reason: "invalid" };
  }

  limiter.reset(clientKey);
  const { expiresAt, token } = createSession(getDb(), PASSWORD_USER, {
    credential: credential.fingerprint,
    now,
    ttlMs: config.sessionTtlMs,
  });
  return { ok: true, expiresAt, token };
}

export function endSession(token: string | undefined): void {
  deleteSession(getDb(), token);
}

/** Hourly cleanup of expired sessions and ones from an older password. */
export function purgeStaleSessions(now: number): number {
  return purgeSessions(getDb(), now, state.credential?.fingerprint ?? null);
}
