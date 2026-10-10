import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getDb } from "../db";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import { parseAuthConfig } from "./config";
import {
  attemptLogin,
  configureAuth,
  getAuthConfig,
  isSessionActive,
  purgeStaleSessions,
  resetAuth,
  resolveIdentity,
  resolvePasswordCredential,
} from "./service";

let dataDir: string;
const now = 5_000_000;

function passwordConfig(password: string) {
  return parseAuthConfig({ ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: password });
}

function identityFor(token: string | undefined, at = now) {
  return resolveIdentity({
    now: at,
    peerIp: "127.0.0.1",
    proxyUser: undefined,
    sessionToken: token,
  });
}

async function signIn(password: string, client = "10.0.0.9") {
  const result = await attemptLogin(password, client, now);
  if (!result.ok) throw new Error(`sign-in failed: ${result.reason}`);
  return result.token;
}

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-auth-service-");
});

afterEach(() => {
  resetAuth();
  cleanupTestDatabase(dataDir);
});

describe("password credential", () => {
  it("hashes a plain password with argon2id and keeps reusing that hash", () => {
    const first = resolvePasswordCredential(passwordConfig("hunter22"), getDb());
    const second = resolvePasswordCredential(passwordConfig("hunter22"), getDb());

    expect(first?.hash).toStartWith("$argon2id$");
    expect(second).toEqual(first);
  });

  it("gets a new fingerprint when the password changes", () => {
    const first = resolvePasswordCredential(passwordConfig("hunter22"), getDb());
    const changed = resolvePasswordCredential(passwordConfig("hunter23"), getDb());

    expect(changed?.fingerprint).not.toBe(first?.fingerprint);
    expect(Bun.password.verifySync("hunter23", changed!.hash)).toBe(true);
  });

  it("uses a configured hash as is, keeping its id until the hash changes", () => {
    const hash = Bun.password.hashSync("from-env", { algorithm: "argon2id" });
    const config = parseAuthConfig({ ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD_HASH: hash });

    const first = resolvePasswordCredential(config, getDb());
    expect(first?.hash).toBe(hash);
    expect(resolvePasswordCredential(config, getDb())).toEqual(first);

    const rehashed = Bun.password.hashSync("from-env", { algorithm: "argon2id" });
    const changed = resolvePasswordCredential(
      parseAuthConfig({ ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD_HASH: rehashed }),
      getDb()
    );
    expect(changed?.fingerprint).not.toBe(first?.fingerprint);
    expect(resolvePasswordCredential(parseAuthConfig({}), getDb())).toBeNull();
  });

  it("stores only the argon2 hash and a random id, nothing else derived from the password", () => {
    const credential = resolvePasswordCredential(passwordConfig("hunter22"), getDb());
    const rows = getDb().prepare("SELECT key, value FROM auth_state ORDER BY key").all();

    expect(rows).toEqual([
      { key: "credential_id", value: credential!.fingerprint },
      { key: "password_hash", value: credential!.hash },
    ]);
    expect(credential!.fingerprint).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("drops the plain password from the applied config", () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    expect(getAuthConfig().password).toBeNull();
  });
});

describe("password sign-in", () => {
  it("creates a session for the right password", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    const token = await signIn("hunter22");

    expect(identityFor(token)).toMatchObject({ access: "edit", user: "admin" });
    expect(isSessionActive(token, now)).toBe(true);
  });

  it("rejects wrong and empty passwords", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());

    expect(await attemptLogin("hunter2", "a", now)).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin("", "a", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("spends the same argon2 work on an empty password as on a wrong one", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    const time = async (password: string) => {
      const start = performance.now();
      await attemptLogin(password, `timing-${password}`, now);
      return performance.now() - start;
    };

    await time("warm-up");
    const wrong = await time("wrong");
    const empty = await time("");
    expect(empty).toBeGreaterThan(wrong / 4);
  });

  it("rate limits failures per client, counting parallel guesses up front", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());

    const results = await Promise.all(
      Array.from({ length: 7 }, () => attemptLogin("guess", "6.6.6.6", now))
    );
    expect(results.filter((result) => !result.ok && result.reason === "invalid")).toHaveLength(5);
    expect(results.filter((result) => !result.ok && result.reason === "rate-limited")).toHaveLength(
      2
    );

    // Even the right password waits, and other clients are unaffected.
    expect(await attemptLogin("hunter22", "6.6.6.6", now)).toMatchObject({
      reason: "rate-limited",
    });
    expect((await attemptLogin("hunter22", "7.7.7.7", now)).ok).toBe(true);
  });

  it("clears a client's failures after a successful sign-in", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    for (let attempt = 0; attempt < 4; attempt += 1) await attemptLogin("guess", "c", now);

    await signIn("hunter22", "c");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await attemptLogin("guess", "c", now)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("is disabled outside password mode", async () => {
    expect(await attemptLogin("anything", "a", now)).toEqual({ ok: false, reason: "disabled" });
    expect(isSessionActive("x".repeat(43), now)).toBe(false);
  });

  it("ends sessions from before a password change", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    const token = await signIn("hunter22");

    // Restart with the same password: the session survives.
    configureAuth(passwordConfig("hunter22"), getDb());
    expect(identityFor(token).access).toBe("edit");

    // Restart with a new password: it doesn't.
    configureAuth(passwordConfig("new-password"), getDb());
    expect(identityFor(token).access).toBe("none");
  });

  it("purges stale sessions", async () => {
    configureAuth(passwordConfig("hunter22"), getDb());
    await signIn("hunter22");
    configureAuth(passwordConfig("new-password"), getDb());

    expect(purgeStaleSessions(now)).toBe(1);
  });
});

describe("request identity", () => {
  it("gives everyone full access with auth off", () => {
    expect(identityFor(undefined)).toEqual({ access: "edit", session: null, user: null });
  });

  it("falls back to guest access or none without a session", () => {
    configureAuth(passwordConfig("pw"), getDb());
    expect(identityFor(undefined).access).toBe("none");

    configureAuth(
      parseAuthConfig({
        ORBITDASH_AUTH: "password",
        ORBITDASH_PASSWORD: "pw",
        ORBITDASH_GUEST: "view",
      }),
      getDb()
    );
    expect(identityFor("not-a-real-session-token-000000000000000000").access).toBe("view");
  });

  it("trusts the proxy header only from trusted proxies", () => {
    configureAuth(
      parseAuthConfig({ ORBITDASH_AUTH: "proxy", ORBITDASH_TRUSTED_PROXIES: "10.0.0.2" }),
      getDb()
    );
    const from = (peerIp: string | null, proxyUser: string | undefined) =>
      resolveIdentity({ now, peerIp, proxyUser, sessionToken: undefined });

    expect(from("10.0.0.2", " chris ")).toEqual({ access: "edit", session: null, user: "chris" });
    expect(from("::ffff:10.0.0.2", "chris").user).toBe("chris");
    expect(from("10.0.0.3", "chris").access).toBe("none");
    expect(from(null, "chris").access).toBe("none");
    expect(from("10.0.0.2", undefined).access).toBe("none");
    expect(from("10.0.0.2", "  ").access).toBe("none");
    expect(from("10.0.0.2", "a\u0007b").access).toBe("none");
    expect(from("10.0.0.2", "x".repeat(257)).access).toBe("none");
  });
});
