import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getDb } from "../db";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import {
  createSession,
  deleteSession,
  hashSessionToken,
  purgeSessions,
  SESSION_REFRESH_INTERVAL_MS,
  verifySession,
} from "./sessions";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const timing = { credential: "fp-1", now: 1_000_000, ttlMs: 30 * DAY };

let dataDir: string;

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-sessions-");
});

afterEach(() => {
  cleanupTestDatabase(dataDir);
});

function rowCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number })
    .count;
}

describe("sessions", () => {
  it("creates a random 32-byte token and stores only its hash", () => {
    const first = createSession(getDb(), "admin", timing);
    const second = createSession(getDb(), "admin", timing);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first.token, "base64url")).toHaveLength(32);
    expect(first.token).not.toBe(second.token);
    expect(first.expiresAt).toBe(timing.now + timing.ttlMs);

    const stored = getDb().prepare("SELECT token_hash FROM sessions").all() as Array<{
      token_hash: string;
    }>;
    expect(stored.map((row) => row.token_hash).sort()).toEqual(
      [hashSessionToken(first.token), hashSessionToken(second.token)].sort()
    );
    expect(JSON.stringify(stored)).not.toContain(first.token);
  });

  it("verifies a live session without writing inside the refresh interval", () => {
    const { token, expiresAt } = createSession(getDb(), "admin", timing);

    expect(verifySession(getDb(), token, { ...timing, now: timing.now + HOUR - 1 })).toEqual({
      expiresAt,
      refreshed: false,
      user: "admin",
    });
  });

  it("slides the expiry once the refresh interval has passed", () => {
    const { token } = createSession(getDb(), "admin", timing);
    const later = timing.now + SESSION_REFRESH_INTERVAL_MS;

    expect(verifySession(getDb(), token, { ...timing, now: later })).toEqual({
      expiresAt: later + timing.ttlMs,
      refreshed: true,
      user: "admin",
    });
    // Still alive past the original expiry, because it slid.
    expect(
      verifySession(getDb(), token, { ...timing, now: timing.now + timing.ttlMs + 1 })?.user
    ).toBe("admin");
  });

  it("checks without sliding when asked", () => {
    const { token, expiresAt } = createSession(getDb(), "admin", timing);
    const later = timing.now + 2 * HOUR;

    expect(verifySession(getDb(), token, { ...timing, now: later }, { slide: false })).toEqual({
      expiresAt,
      refreshed: false,
      user: "admin",
    });
  });

  it("expires sessions and deletes them", () => {
    const { token, expiresAt } = createSession(getDb(), "admin", timing);

    expect(verifySession(getDb(), token, { ...timing, now: expiresAt })).toBeNull();
    expect(rowCount()).toBe(0);
  });

  it("rejects sessions made under another password", () => {
    const { token } = createSession(getDb(), "admin", timing);

    expect(verifySession(getDb(), token, { ...timing, credential: "fp-2" })).toBeNull();
    expect(rowCount()).toBe(0);
  });

  it("rejects unknown and malformed tokens", () => {
    createSession(getDb(), "admin", timing);

    expect(verifySession(getDb(), undefined, timing)).toBeNull();
    expect(verifySession(getDb(), "", timing)).toBeNull();
    expect(verifySession(getDb(), "short", timing)).toBeNull();
    expect(verifySession(getDb(), "A".repeat(43), timing)).toBeNull();
    expect(rowCount()).toBe(1);
  });

  it("deletes a session on logout", () => {
    const { token } = createSession(getDb(), "admin", timing);
    deleteSession(getDb(), "not-a-token");
    deleteSession(getDb(), undefined);
    expect(rowCount()).toBe(1);

    deleteSession(getDb(), token);
    expect(verifySession(getDb(), token, timing)).toBeNull();
    expect(rowCount()).toBe(0);
  });

  it("purges expired sessions and ones from another password", () => {
    createSession(getDb(), "admin", { ...timing, ttlMs: HOUR });
    createSession(getDb(), "admin", { ...timing, credential: "fp-old" });
    const kept = createSession(getDb(), "admin", timing);

    expect(purgeSessions(getDb(), timing.now + 2 * HOUR, "fp-1")).toBe(2);
    expect(verifySession(getDb(), kept.token, timing)?.user).toBe("admin");
  });

  it("purges only expired sessions when no password is in force", () => {
    createSession(getDb(), "admin", { ...timing, ttlMs: HOUR });
    createSession(getDb(), "admin", { ...timing, credential: "fp-old" });

    expect(purgeSessions(getDb(), timing.now + 2 * HOUR, null)).toBe(1);
    expect(rowCount()).toBe(1);
  });
});
