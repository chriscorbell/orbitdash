import { describe, expect, it } from "vitest";
import { normalizeIconUrl, normalizeLinkUrl } from "./urls.ts";

describe("normalizeLinkUrl", () => {
  it("normalizes a valid https URL", () => {
    expect(normalizeLinkUrl(" https://example.com/app ")).toBe("https://example.com/app");
  });

  it("respects explicit schemes", () => {
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeLinkUrl("https://10.0.0.20:8096")).toBe("https://10.0.0.20:8096/");
    expect(normalizeLinkUrl("https://nas:5000")).toBe("https://nas:5000/");
    expect(normalizeLinkUrl("https://jellyfin.local")).toBe("https://jellyfin.local/");
  });

  it("adds https to schemeless public hostnames", () => {
    expect(normalizeLinkUrl("example.com/app")).toBe("https://example.com/app");
    expect(normalizeLinkUrl("jellyfin.example.com")).toBe("https://jellyfin.example.com/");
    expect(normalizeLinkUrl("example.com:443/app")).toBe("https://example.com/app");
  });

  it("adds http to schemeless IP literals", () => {
    expect(normalizeLinkUrl("10.0.0.20:8096")).toBe("http://10.0.0.20:8096/");
    expect(normalizeLinkUrl("192.168.1.10")).toBe("http://192.168.1.10/");
    expect(normalizeLinkUrl("[::1]:8080")).toBe("http://[::1]:8080/");
    expect(normalizeLinkUrl("[fd00::20]")).toBe("http://[fd00::20]/");
  });

  it("adds http to schemeless single-label hostnames", () => {
    expect(normalizeLinkUrl("nas")).toBe("http://nas/");
    expect(normalizeLinkUrl("nas:5000")).toBe("http://nas:5000/");
    expect(normalizeLinkUrl("localhost")).toBe("http://localhost/");
    expect(normalizeLinkUrl("localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeLinkUrl("nas.")).toBe("http://nas./");
  });

  it("adds http to schemeless private-suffix hostnames", () => {
    expect(normalizeLinkUrl("jellyfin.local")).toBe("http://jellyfin.local/");
    expect(normalizeLinkUrl("router.lan/admin")).toBe("http://router.lan/admin");
    expect(normalizeLinkUrl("pihole.home")).toBe("http://pihole.home/");
    expect(normalizeLinkUrl("grafana.internal")).toBe("http://grafana.internal/");
    expect(normalizeLinkUrl("nas.home.arpa")).toBe("http://nas.home.arpa/");
    expect(normalizeLinkUrl("nas.local.")).toBe("http://nas.local./");
  });

  it("adds http to schemeless hostnames with a port other than 443", () => {
    expect(normalizeLinkUrl("example.com:8080")).toBe("http://example.com:8080/");
    expect(normalizeLinkUrl("example.com:80/app")).toBe("http://example.com/app");
  });

  it("keeps https for public names that only resemble private suffixes", () => {
    expect(normalizeLinkUrl("example.localhost.com")).toBe("https://example.localhost.com/");
    expect(normalizeLinkUrl("mylan.com")).toBe("https://mylan.com/");
    expect(normalizeLinkUrl("example.homes")).toBe("https://example.homes/");
  });

  it("rejects unsupported protocols", () => {
    expect(normalizeLinkUrl("ftp://example.com")).toBeNull();
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(normalizeLinkUrl("")).toBeNull();
    expect(normalizeLinkUrl("   ")).toBeNull();
    expect(normalizeLinkUrl("not a url")).toBeNull();
  });
});

describe("normalizeIconUrl", () => {
  it("normalizes a valid http URL", () => {
    expect(normalizeIconUrl("http://example.com/icon.svg")).toBe("http://example.com/icon.svg");
  });

  it("rejects invalid input", () => {
    expect(normalizeIconUrl("")).toBeNull();
    expect(normalizeIconUrl("file:///tmp/icon.png")).toBeNull();
  });
});
