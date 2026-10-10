import { describe, expect, it } from "vitest";
import {
  bucketState,
  DEFAULT_CHECK_CONFIG,
  describeCheckTarget,
  formatHostPort,
  isAcceptedHttpStatus,
  normalizeCheckTarget,
  parseHostPort,
  resolveCheckConfig,
  resolveCheckTarget,
} from "./status";

describe("isAcceptedHttpStatus", () => {
  it("accepts 2xx, 3xx and login walls", () => {
    for (const status of [200, 204, 301, 302, 304, 399, 401, 403]) {
      expect(isAcceptedHttpStatus(status)).toBe(true);
    }
    for (const status of [100, 199, 400, 404, 405, 429, 500, 502, 503]) {
      expect(isAcceptedHttpStatus(status)).toBe(false);
    }
  });
});

describe("host and port", () => {
  it("parses names, IPv4 and bracketed IPv6", () => {
    expect(parseHostPort(" NAS.lan:22 ")).toEqual({ host: "nas.lan", port: 22 });
    expect(parseHostPort("10.0.0.2:8443")).toEqual({ host: "10.0.0.2", port: 8443 });
    expect(parseHostPort("[FD00::2]:53")).toEqual({ host: "fd00::2", port: 53 });
    expect(parseHostPort("a:1")).toEqual({ host: "a", port: 1 });
  });

  it("rejects anything without one host and a valid port", () => {
    for (const input of ["nas", "nas:", ":22", "nas:0", "nas:65536", "fd00::2:53", "a b:1"]) {
      expect(parseHostPort(input)).toBeNull();
    }
    expect(parseHostPort("http://nas:80")).toBeNull();
  });

  it("formats IPv6 hosts in brackets", () => {
    expect(formatHostPort({ host: "nas", port: 22 })).toBe("nas:22");
    expect(formatHostPort({ host: "fd00::2", port: 22 })).toBe("[fd00::2]:22");
  });
});

describe("normalizeCheckTarget", () => {
  it("treats blank as the link URL", () => {
    expect(normalizeCheckTarget("http", undefined)).toEqual({ ok: true, value: null });
    expect(normalizeCheckTarget("tcp", null)).toEqual({ ok: true, value: null });
    expect(normalizeCheckTarget("http", "   ")).toEqual({ ok: true, value: null });
  });

  it("normalizes HTTP targets like service URLs", () => {
    expect(normalizeCheckTarget("http", "nas.lan:8080/health")).toEqual({
      ok: true,
      value: "http://nas.lan:8080/health",
    });
    expect(normalizeCheckTarget("http", "ftp://nas/")).toEqual({
      ok: false,
      error: "check url must be a valid URL",
    });
  });

  it("normalizes TCP targets to host:port", () => {
    expect(normalizeCheckTarget("tcp", " NAS:22 ")).toEqual({ ok: true, value: "nas:22" });
    expect(normalizeCheckTarget("tcp", "https://nas/")).toEqual({
      ok: false,
      error: "check address must be a host and port, like nas.lan:22",
    });
  });
});

describe("resolveCheckTarget", () => {
  it("checks the link URL unless a target is set", () => {
    expect(resolveCheckTarget({ check_method: "http", check_target: null }, "nas:5000")).toEqual({
      method: "http",
      url: "http://nas:5000/",
    });
    expect(
      resolveCheckTarget(
        { check_method: "http", check_target: "http://nas:5000/health" },
        "https://example.com"
      )
    ).toEqual({ method: "http", url: "http://nas:5000/health" });
    expect(resolveCheckTarget({ check_method: "http", check_target: null }, "ftp://x/")).toBeNull();
  });

  it("derives a TCP address from the link's host and port", () => {
    const tcp = (linkUrl: string, target: string | null = null) =>
      resolveCheckTarget({ check_method: "tcp", check_target: target }, linkUrl);

    expect(tcp("https://pve.lan:8006/")).toEqual({ method: "tcp", host: "pve.lan", port: 8006 });
    expect(tcp("https://example.com/")).toEqual({ method: "tcp", host: "example.com", port: 443 });
    expect(tcp("http://[fd00::2]/")).toEqual({ method: "tcp", host: "fd00::2", port: 80 });
    expect(tcp("https://example.com/", "nas:22")).toEqual({ method: "tcp", host: "nas", port: 22 });
    expect(tcp("https://example.com/", "bogus")).toBeNull();
    expect(tcp("ftp://example.com/")).toBeNull();
  });

  it("describes targets for display and keys", () => {
    expect(describeCheckTarget({ method: "http", url: "http://nas/" })).toBe("http://nas/");
    expect(describeCheckTarget({ method: "tcp", host: "fd00::2", port: 22 })).toBe("[fd00::2]:22");
  });
});

describe("resolveCheckConfig", () => {
  it("fills in defaults for a new service", () => {
    expect(resolveCheckConfig(DEFAULT_CHECK_CONFIG, {})).toEqual({
      ok: true,
      value: DEFAULT_CHECK_CONFIG,
    });
    expect(
      resolveCheckConfig(DEFAULT_CHECK_CONFIG, {
        check_enabled: true,
        check_method: "tcp",
        check_target: "NAS:22",
        check_interval: 30,
        check_ignore_tls: true,
      })
    ).toEqual({
      ok: true,
      value: {
        check_enabled: true,
        check_method: "tcp",
        check_target: "nas:22",
        check_interval: 30,
        check_ignore_tls: true,
      },
    });
  });

  it("keeps the stored target unless the method changes", () => {
    const current = { ...DEFAULT_CHECK_CONFIG, check_target: "http://nas/health" };
    expect(resolveCheckConfig(current, { check_enabled: true })).toMatchObject({
      ok: true,
      value: { check_enabled: true, check_target: "http://nas/health" },
    });
    expect(resolveCheckConfig(current, { check_method: "tcp" })).toMatchObject({
      ok: true,
      value: { check_method: "tcp", check_target: null },
    });
    expect(resolveCheckConfig(current, { check_target: null })).toMatchObject({
      ok: true,
      value: { check_target: null },
    });
  });

  it("rejects a target that doesn't suit the method", () => {
    expect(
      resolveCheckConfig(DEFAULT_CHECK_CONFIG, { check_method: "tcp", check_target: "nas" })
    ).toEqual({ ok: false, error: "check address must be a host and port, like nas.lan:22" });
  });
});

describe("bucketState", () => {
  it("reads a stretch of checks at a glance", () => {
    expect(bucketState({ checks: 0, failures: 0, slow: 0 })).toBe("none");
    expect(bucketState({ checks: 4, failures: 0, slow: 0 })).toBe("up");
    expect(bucketState({ checks: 4, failures: 0, slow: 2 })).toBe("up");
    expect(bucketState({ checks: 4, failures: 0, slow: 3 })).toBe("degraded");
    expect(bucketState({ checks: 4, failures: 1, slow: 0 })).toBe("degraded");
    expect(bucketState({ checks: 4, failures: 4, slow: 0 })).toBe("down");
  });
});
