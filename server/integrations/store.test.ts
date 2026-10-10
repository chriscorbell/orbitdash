import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import { decryptSecret, encryptSecret, getSecretKey, resetSecretKeyForTesting } from "./secrets";
import {
  deleteIntegration,
  deleteIntegrationsOf,
  getIntegration,
  IntegrationInputError,
  listIntegrations,
  prepareIntegration,
  saveIntegration,
  toAdapterConfig,
} from "./store";

let dataDir: string;
beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-integrations-");
  resetSecretKeyForTesting();
});
afterEach(() => {
  resetSecretKeyForTesting();
  cleanupTestDatabase(dataDir);
});

describe("secrets", () => {
  it("creates a private key once and round-trips secrets", () => {
    const key = getSecretKey(dataDir);
    const file = path.join(dataDir, "secret.key");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(getSecretKey(dataDir)).toBe(key);
    resetSecretKeyForTesting();
    expect(getSecretKey(dataDir).equals(key)).toBe(true);

    const sealed = encryptSecret("api-key", key);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("api-key");
    expect(decryptSecret(sealed, key)).toBe("api-key");
    expect(decryptSecret(sealed, Buffer.alloc(32, 1))).toBeNull();
    expect(decryptSecret("plain", key)).toBeNull();
  });

  it("replaces a broken key file", () => {
    fs.writeFileSync(path.join(dataDir, "secret.key"), "short");
    expect(getSecretKey(dataDir)).toHaveLength(32);
  });
});

describe("integration store", () => {
  it("stores values, seals secrets and keeps them when left out", () => {
    const first = prepareIntegration("svc", "adguard", {
      url: " https://dns.lan ",
      username: "me",
      password: "pw",
      ignoreTls: true,
    });
    expect(first.stored.values).toEqual({
      url: "https://dns.lan",
      username: "me",
      ignoreTls: true,
    });
    expect(first.stored.secrets.password).not.toContain("pw");
    expect(saveIntegration("svc", first.stored)).toEqual({
      type: "adguard",
      values: { url: "https://dns.lan", username: "me", ignoreTls: true },
      secretsSet: ["password"],
    });

    const kept = prepareIntegration("svc", "adguard", { username: "me2" });
    expect(toAdapterConfig(kept.stored, "http://svc.lan/")).toEqual({
      url: "http://svc.lan/",
      values: { username: "me2", password: "pw" },
    });
    expect(() => prepareIntegration("svc", "adguard", { username: "me", password: null })).toThrow(
      "Password is required"
    );
    // A different type starts fresh.
    expect(() => prepareIntegration("svc", "pihole", {})).toThrow(
      "Password or API token is required"
    );
  });

  it("checks types, required fields and URLs", () => {
    expect(() => prepareIntegration(null, "nope", {})).toThrow(IntegrationInputError);
    expect(() => prepareIntegration(null, "adguard", { password: "x" })).toThrow(
      "Username is required"
    );
    expect(() =>
      prepareIntegration(null, "adguard", { username: "a", password: "b", url: "ftp://x" })
    ).toThrow("API address must be an http(s) URL");
  });

  it("lists, deletes and survives corrupt rows", async () => {
    saveIntegration("a", prepareIntegration(null, "jellyfin", { apiKey: "k" }).stored);
    saveIntegration("b", prepareIntegration(null, "jellyfin", { apiKey: "k" }).stored);
    const { getDb } = await import("../db");
    getDb().prepare("INSERT INTO settings (key, value) VALUES ('integration.c', '{oops')").run();
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('integration.d', ?)")
      .run(JSON.stringify({ type: "gone", values: 3, secrets: 4 }));
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('integration.e', ?)")
      .run(JSON.stringify({ type: "plex" }));
    expect([...listIntegrations().keys()].sort()).toEqual(["a", "b", "e"]);
    expect(getIntegration("c")).toBeNull();
    expect(getIntegration("d")).toBeNull();
    expect(getIntegration("e")).toEqual({ type: "plex", values: {}, secretsSet: [] });

    expect(deleteIntegration("a")).toBe(true);
    expect(deleteIntegration("a")).toBe(false);
    deleteIntegrationsOf(["b"]);
    expect(getIntegration("b")).toBeNull();
  });
});
