import { describe, expect, it } from "bun:test";
import { AuthConfigError, DEFAULT_SESSION_DAYS, parseAuthConfig } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;
const HASH = Bun.password.hashSync("correct horse", { algorithm: "argon2id" });

function expectConfigError(env: Record<string, string>, message: string | RegExp) {
  expect(() => parseAuthConfig(env)).toThrow(AuthConfigError);
  expect(() => parseAuthConfig(env)).toThrow(message);
}

describe("parseAuthConfig", () => {
  it("defaults to no auth", () => {
    const config = parseAuthConfig({});
    expect(config).toMatchObject({
      guest: "none",
      mode: "none",
      password: null,
      passwordHash: null,
      proxyHeader: "remote-user",
      sessionTtlMs: DEFAULT_SESSION_DAYS * DAY_MS,
    });
    expect(config.trustedProxies.isEmpty).toBe(true);
  });

  it("reads password mode with a plain password, kept exactly as given", () => {
    const config = parseAuthConfig({
      ORBITDASH_AUTH: " Password ",
      ORBITDASH_PASSWORD: " spaced secret ",
      ORBITDASH_GUEST: "view",
      ORBITDASH_SESSION_DAYS: "7",
    });
    expect(config).toMatchObject({
      guest: "view",
      mode: "password",
      password: " spaced secret ",
      passwordHash: null,
      sessionTtlMs: 7 * DAY_MS,
    });
  });

  it("reads password mode with an argon2 hash", () => {
    const config = parseAuthConfig({ ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD_HASH: HASH });
    expect(config.passwordHash).toBe(HASH);
    expect(config.password).toBeNull();
  });

  it("reads proxy mode with its header and trusted proxies", () => {
    const config = parseAuthConfig({
      ORBITDASH_AUTH: "proxy",
      ORBITDASH_PROXY_HEADER: "Tailscale-User-Login",
      ORBITDASH_TRUSTED_PROXIES: "127.0.0.1, ::1",
    });
    expect(config.mode).toBe("proxy");
    expect(config.proxyHeader).toBe("tailscale-user-login");
    expect(config.trustedProxies.entries).toEqual(["127.0.0.1", "::1"]);
    expect(config.trustedProxies.matches("::ffff:127.0.0.1")).toBe(true);
  });

  it("accepts trusted proxies in password mode, for forwarded headers", () => {
    const config = parseAuthConfig({
      ORBITDASH_AUTH: "password",
      ORBITDASH_PASSWORD: "pw",
      ORBITDASH_TRUSTED_PROXIES: "10.0.0.0/8",
    });
    expect(config.trustedProxies.matches("10.1.1.1")).toBe(true);
  });

  it("treats empty values as unset", () => {
    const config = parseAuthConfig({
      ORBITDASH_AUTH: "",
      ORBITDASH_PASSWORD: "",
      ORBITDASH_PASSWORD_HASH: " ",
      ORBITDASH_GUEST: "",
      ORBITDASH_SESSION_DAYS: "",
      ORBITDASH_PROXY_HEADER: "",
    });
    expect(config.mode).toBe("none");
    expect(config.sessionTtlMs).toBe(DEFAULT_SESSION_DAYS * DAY_MS);
  });

  it("rejects unknown modes and guest values", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "basic" },
      'ORBITDASH_AUTH must be one of none, password, proxy (got "basic")'
    );
    expectConfigError(
      { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: "pw", ORBITDASH_GUEST: "read" },
      "ORBITDASH_GUEST must be one of none, view"
    );
  });

  it("refuses password mode without a password, or with both kinds", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "password" },
      "ORBITDASH_AUTH=password needs ORBITDASH_PASSWORD"
    );
    expectConfigError(
      { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: "pw", ORBITDASH_PASSWORD_HASH: HASH },
      "not both"
    );
  });

  it("refuses a password that is too long", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: "x".repeat(1025) },
      "at most 1024 characters"
    );
  });

  it("refuses a password hash that isn't argon2, pointing at compose escaping", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD_HASH: "$2b$10$abcdefghijklmnopqrstuv" },
      /write every \$ in it as \$\$/
    );
    // What compose leaves of an unescaped hash.
    expectConfigError(
      { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD_HASH: "=19=65536,t=2,p=1" },
      "must be an argon2 hash"
    );
  });

  it("refuses an argon2-shaped hash Bun can't read", () => {
    expectConfigError(
      {
        ORBITDASH_AUTH: "password",
        ORBITDASH_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA",
      },
      "could not be read"
    );
  });

  it("refuses a password while auth is off or in proxy mode", () => {
    expectConfigError(
      { ORBITDASH_PASSWORD: "pw" },
      'ORBITDASH_PASSWORD is set but ORBITDASH_AUTH is "none"'
    );
    expectConfigError(
      { ORBITDASH_PASSWORD_HASH: HASH },
      'ORBITDASH_PASSWORD_HASH is set but ORBITDASH_AUTH is "none"'
    );
    expectConfigError(
      { ORBITDASH_AUTH: "proxy", ORBITDASH_TRUSTED_PROXIES: "::1", ORBITDASH_PASSWORD: "pw" },
      'ORBITDASH_AUTH is "proxy"'
    );
  });

  it("refuses guest access while auth is off", () => {
    expectConfigError({ ORBITDASH_GUEST: "view" }, "ORBITDASH_GUEST=view needs ORBITDASH_AUTH");
  });

  it("refuses proxy mode without trusted proxies", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "proxy" },
      "ORBITDASH_AUTH=proxy needs ORBITDASH_TRUSTED_PROXIES"
    );
  });

  it("refuses invalid trusted proxies and header names", () => {
    expectConfigError(
      { ORBITDASH_AUTH: "proxy", ORBITDASH_TRUSTED_PROXIES: "127.0.0.1, traefik" },
      'ORBITDASH_TRUSTED_PROXIES: "traefik" is not an IP address or CIDR range'
    );
    expectConfigError(
      {
        ORBITDASH_AUTH: "proxy",
        ORBITDASH_TRUSTED_PROXIES: "127.0.0.1",
        ORBITDASH_PROXY_HEADER: "Remote User",
      },
      "ORBITDASH_PROXY_HEADER is not a valid header name"
    );
  });

  it("refuses session lengths outside 1 to 400 days", () => {
    for (const days of ["0", "401", "1.5", "-3", "soon"]) {
      expectConfigError(
        { ORBITDASH_AUTH: "password", ORBITDASH_PASSWORD: "pw", ORBITDASH_SESSION_DAYS: days },
        "ORBITDASH_SESSION_DAYS must be a whole number from 1 to 400"
      );
    }
    expect(parseAuthConfig({ ORBITDASH_SESSION_DAYS: "400" }).sessionTtlMs).toBe(400 * DAY_MS);
  });
});
