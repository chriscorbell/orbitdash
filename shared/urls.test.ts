import { describe, expect, it } from "vitest";
import { normalizeIconUrl, normalizeServiceUrl } from "@shared/urls";

describe("normalizeServiceUrl", () => {
  it("normalizes a valid https URL", () => {
    expect(normalizeServiceUrl(" https://example.com/app ")).toBe("https://example.com/app");
  });

  it("respects explicit schemes", () => {
    expect(normalizeServiceUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeServiceUrl("https://10.0.0.20:8096")).toBe("https://10.0.0.20:8096/");
    expect(normalizeServiceUrl("https://nas:5000")).toBe("https://nas:5000/");
    expect(normalizeServiceUrl("https://jellyfin.local")).toBe("https://jellyfin.local/");
  });

  it("adds https to schemeless public hostnames", () => {
    expect(normalizeServiceUrl("example.com/app")).toBe("https://example.com/app");
    expect(normalizeServiceUrl("jellyfin.example.com")).toBe("https://jellyfin.example.com/");
    expect(normalizeServiceUrl("example.com:443/app")).toBe("https://example.com/app");
  });

  it("adds http to schemeless IP literals", () => {
    expect(normalizeServiceUrl("10.0.0.20:8096")).toBe("http://10.0.0.20:8096/");
    expect(normalizeServiceUrl("192.168.1.10")).toBe("http://192.168.1.10/");
    expect(normalizeServiceUrl("[::1]:8080")).toBe("http://[::1]:8080/");
    expect(normalizeServiceUrl("[fd00::20]")).toBe("http://[fd00::20]/");
  });

  it("adds http to schemeless single-label hostnames", () => {
    expect(normalizeServiceUrl("nas")).toBe("http://nas/");
    expect(normalizeServiceUrl("nas:5000")).toBe("http://nas:5000/");
    expect(normalizeServiceUrl("localhost")).toBe("http://localhost/");
    expect(normalizeServiceUrl("localhost:3000")).toBe("http://localhost:3000/");
    expect(normalizeServiceUrl("nas.")).toBe("http://nas./");
  });

  it("adds http to schemeless private-suffix hostnames", () => {
    expect(normalizeServiceUrl("jellyfin.local")).toBe("http://jellyfin.local/");
    expect(normalizeServiceUrl("router.lan/admin")).toBe("http://router.lan/admin");
    expect(normalizeServiceUrl("pihole.home")).toBe("http://pihole.home/");
    expect(normalizeServiceUrl("grafana.internal")).toBe("http://grafana.internal/");
    expect(normalizeServiceUrl("nas.home.arpa")).toBe("http://nas.home.arpa/");
    expect(normalizeServiceUrl("nas.local.")).toBe("http://nas.local./");
  });

  it("adds http to schemeless hostnames with a port other than 443", () => {
    expect(normalizeServiceUrl("example.com:8080")).toBe("http://example.com:8080/");
    expect(normalizeServiceUrl("example.com:80/app")).toBe("http://example.com/app");
  });

  it("keeps https for public names that only resemble private suffixes", () => {
    expect(normalizeServiceUrl("example.localhost.com")).toBe("https://example.localhost.com/");
    expect(normalizeServiceUrl("mylan.com")).toBe("https://mylan.com/");
    expect(normalizeServiceUrl("example.homes")).toBe("https://example.homes/");
  });

  it("rejects unsupported protocols", () => {
    expect(normalizeServiceUrl("ftp://example.com")).toBeNull();
    expect(normalizeServiceUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(normalizeServiceUrl("")).toBeNull();
    expect(normalizeServiceUrl("   ")).toBeNull();
    expect(normalizeServiceUrl("not a url")).toBeNull();
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
