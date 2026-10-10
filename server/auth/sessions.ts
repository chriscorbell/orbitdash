import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "crypto";

/**
 * Password-mode sessions. The browser holds a random 32-byte token in an HttpOnly cookie; the
 * database holds only its SHA-256, so a leaked database (or backup snapshot) can't be replayed.
 * Expiry slides with use, refreshed at most once per interval so busy pages don't write on every
 * request.
 */

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

// 32 bytes in base64url, without padding.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface SessionRow {
  credential: string;
  expires_at: number;
  refreshed_at: number;
  user: string;
}

export interface SessionTiming {
  /** Fingerprint of the password in force; sessions made under another one are invalid. */
  credential: string;
  now: number;
  ttlMs: number;
}

export interface VerifiedSession {
  expiresAt: number;
  /** True when this check slid the expiry, so the cookie should be sent again. */
  refreshed: boolean;
  user: string;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(
  db: Database,
  user: string,
  { credential, now, ttlMs }: SessionTiming
): { expiresAt: number; token: string } {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const expiresAt = now + ttlMs;
  db.prepare(
    `INSERT INTO sessions (token_hash, user, credential, created_at, refreshed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(hashSessionToken(token), user, credential, now, now, expiresAt);
  return { expiresAt, token };
}

/**
 * Returns the session's user, or null if the token is unknown, expired, or from an older password.
 * Dead sessions are deleted on the way. With `slide`, an active session's expiry moves forward.
 */
export function verifySession(
  db: Database,
  token: string | undefined,
  { credential, now, ttlMs }: SessionTiming,
  { slide = true }: { slide?: boolean } = {}
): VerifiedSession | null {
  if (!token || !TOKEN_PATTERN.test(token)) return null;

  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare("SELECT user, credential, refreshed_at, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as SessionRow | null;
  if (!row) return null;

  if (row.expires_at <= now || row.credential !== credential) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  if (slide && now - row.refreshed_at >= SESSION_REFRESH_INTERVAL_MS) {
    const expiresAt = now + ttlMs;
    db.prepare("UPDATE sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ?").run(
      now,
      expiresAt,
      tokenHash
    );
    return { expiresAt, refreshed: true, user: row.user };
  }

  return { expiresAt: row.expires_at, refreshed: false, user: row.user };
}

export function deleteSession(db: Database, token: string | undefined): void {
  if (!token || !TOKEN_PATTERN.test(token)) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

/** Removes expired sessions and ones made under another password; returns how many went. */
export function purgeSessions(db: Database, now: number, credential: string | null): number {
  const result =
    credential === null
      ? db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now)
      : db
          .prepare("DELETE FROM sessions WHERE expires_at <= ? OR credential != ?")
          .run(now, credential);
  return result.changes;
}
