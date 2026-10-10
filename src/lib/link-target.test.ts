import { describe, expect, it } from "vitest";
import { isPrivateHostname, resolveLinkTarget, serviceHref } from "@/lib/link-target";

describe("isPrivateHostname", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "nas",
    "nas.",
    "nas.local",
    "router.lan",
    "pve.home",
    "dash.home.arpa",
    "grafana.internal",
    "box.localdomain",
    "orbit.tail1234.ts.net",
    "10.0.0.20",
    "10.255.255.255",
    "127.0.0.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.10",
    "169.254.10.1",
    "100.64.0.1",
    "100.100.100.100",
    "100.127.255.255",
    "0.0.0.0",
    "[::1]",
    "::1",
    "[fd7a:115c:a1e0::1]",
    "fc00::1",
    "[fe80::1]",
    "febf::1",
    "[::ffff:a00:14]",
    "[::ffff:c0a8:10a]",
  ])("treats %s as your own network", (host) => {
    expect(isPrivateHostname(host)).toBe(true);
  });

  it.each([
    "dash.example.com",
    "example.com",
    "orbit.duckdns.org",
    "lan.example.com",
    "localhost.example.com.evil",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.1.1",
    "100.63.255.255",
    "100.128.0.1",
    "11.0.0.1",
    "[2606:4700::1111]",
    "2001:db8::1",
    "[fcd::1]",
    "fec0::1",
    "[::ffff:808:808]",
  ])("treats %s as reached from outside", (host) => {
    expect(isPrivateHostname(host)).toBe(false);
  });
});

describe("resolveLinkTarget", () => {
  it("follows the address in auto", () => {
    expect(resolveLinkTarget("auto", "192.168.1.10")).toBe("internal");
    expect(resolveLinkTarget("auto", "dash.example.com")).toBe("external");
  });

  it("keeps a fixed choice whatever the address", () => {
    expect(resolveLinkTarget("internal", "dash.example.com")).toBe("internal");
    expect(resolveLinkTarget("external", "192.168.1.10")).toBe("external");
  });
});

describe("serviceHref", () => {
  const service = { url: "http://10.0.0.20:8096/", external_url: "https://jf.example.com/" };

  it("opens the URL for the target", () => {
    expect(serviceHref(service, "internal")).toBe("http://10.0.0.20:8096/");
    expect(serviceHref(service, "external")).toBe("https://jf.example.com/");
  });

  it("falls back to the main URL when there is no external one", () => {
    expect(serviceHref({ ...service, external_url: null }, "external")).toBe(
      "http://10.0.0.20:8096/"
    );
  });
});
