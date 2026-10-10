import { describe, expect, it } from "bun:test";
import {
  createIpMatcher,
  InvalidIpEntryError,
  parseCidr,
  parseIp,
  parseIpList,
  resolveClientIp,
} from "./ip";

describe("parseIp", () => {
  it("parses IPv4 addresses", () => {
    expect(parseIp("10.0.0.1")).toEqual({ version: 4, value: 0x0a000001n });
    expect(parseIp("255.255.255.255")).toEqual({ version: 4, value: 0xffffffffn });
    expect(parseIp(" 0.0.0.0 ")).toEqual({ version: 4, value: 0n });
  });

  it("rejects malformed IPv4 addresses", () => {
    for (const input of [
      "",
      "10.0.0",
      "10.0.0.1.2",
      "256.0.0.1",
      "10.0.0.01",
      "a.b.c.d",
      "1..2.3",
    ]) {
      expect(parseIp(input)).toBeNull();
    }
  });

  it("parses IPv6 addresses, with brackets and zone ids", () => {
    expect(parseIp("::1")).toEqual({ version: 6, value: 1n });
    expect(parseIp("::")).toEqual({ version: 6, value: 0n });
    expect(parseIp("[2001:db8::1]")).toEqual({
      version: 6,
      value: 0x20010db8000000000000000000000001n,
    });
    expect(parseIp("fe80::1%eth0")).toEqual({
      version: 6,
      value: 0xfe800000000000000000000000000001n,
    });
    expect(parseIp("1:2:3:4:5:6:7:8")?.value).toBe(0x00010002000300040005000600070008n);
    expect(parseIp("1:2:3:4:5:6:7::")?.value).toBe(0x00010002000300040005000600070000n);
    expect(parseIp("2001:DB8::")?.version).toBe(6);
  });

  it("rejects malformed IPv6 addresses", () => {
    for (const input of [
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "1::2::3",
      "1:2:3:4:5:6:7:8::",
      ":1::2",
      "1:::2",
      "12345::1",
      "g::1",
      "::ffff:300.1.1.1",
    ]) {
      expect(parseIp(input)).toBeNull();
    }
  });

  it("treats IPv4-mapped IPv6 addresses as IPv4", () => {
    expect(parseIp("::ffff:10.0.0.1")).toEqual({ version: 4, value: 0x0a000001n });
    expect(parseIp("::ffff:a00:1")).toEqual({ version: 4, value: 0x0a000001n });
    expect(parseIp("0:0:0:0:0:ffff:10.0.0.1")).toEqual({ version: 4, value: 0x0a000001n });
    // An embedded IPv4 address that isn't the mapped prefix stays IPv6.
    expect(parseIp("::10.0.0.1")).toEqual({ version: 6, value: 0x0a000001n });
    expect(parseIp("64:ff9b::192.0.2.1")?.version).toBe(6);
    expect(parseIp("1:2:3:4:5:6:1.2.3.4")?.version).toBe(6);
  });
});

describe("parseCidr", () => {
  it("masks host bits and defaults to a single host", () => {
    expect(parseCidr("10.1.2.3/8")).toEqual({ version: 4, value: 0x0a000000n, prefix: 8 });
    expect(parseCidr("10.1.2.3")).toEqual({ version: 4, value: 0x0a010203n, prefix: 32 });
    expect(parseCidr("2001:db8::1/32")).toEqual({
      version: 6,
      value: 0x20010db8000000000000000000000000n,
      prefix: 32,
    });
    expect(parseCidr("::1")?.prefix).toBe(128);
  });

  it("narrows IPv4-mapped ranges to IPv4", () => {
    expect(parseCidr("::ffff:10.0.0.0/104")).toEqual({ version: 4, value: 0x0a000000n, prefix: 8 });
    expect(parseCidr("::ffff:0:0/96")).toEqual({ version: 4, value: 0n, prefix: 0 });
    expect(parseCidr("::ffff:10.0.0.0/64")?.version).toBe(6);
  });

  it("rejects bad prefixes and addresses", () => {
    for (const input of [
      "10.0.0.0/33",
      "10.0.0.0/-1",
      "10.0.0.0/a",
      "10.0.0.0/8/8",
      "::/129",
      "::ffff:10.0.0.0/129",
      "nope/8",
      "10.0.0.0/",
    ]) {
      expect(parseCidr(input)).toBeNull();
    }
  });
});

describe("createIpMatcher", () => {
  const matcher = createIpMatcher(["10.0.0.0/8", "192.168.1.5", "fd00::/8", "::1"]);

  it("matches IPv4 ranges and single hosts", () => {
    expect(matcher.matches("10.200.3.4")).toBe(true);
    expect(matcher.matches("192.168.1.5")).toBe(true);
    expect(matcher.matches("192.168.1.6")).toBe(false);
    expect(matcher.matches("11.0.0.1")).toBe(false);
  });

  it("matches IPv6 ranges", () => {
    expect(matcher.matches("fd12:3456::9")).toBe(true);
    expect(matcher.matches("::1")).toBe(true);
    expect(matcher.matches("[::1]")).toBe(true);
    expect(matcher.matches("fe80::1")).toBe(false);
  });

  it("matches IPv4-mapped IPv6 addresses against IPv4 entries", () => {
    expect(matcher.matches("::ffff:10.9.8.7")).toBe(true);
    expect(matcher.matches("::ffff:192.168.1.5")).toBe(true);
    expect(matcher.matches("::ffff:192.168.1.6")).toBe(false);
  });

  it("never matches across versions, or missing and invalid addresses", () => {
    expect(createIpMatcher(["0.0.0.0/0"]).matches("::2")).toBe(false);
    expect(createIpMatcher(["::/0"]).matches("10.0.0.1")).toBe(false);
    expect(matcher.matches(null)).toBe(false);
    expect(matcher.matches(undefined)).toBe(false);
    expect(matcher.matches("")).toBe(false);
    expect(matcher.matches("not-an-ip")).toBe(false);
  });

  it("matches everything with a zero prefix", () => {
    expect(createIpMatcher(["0.0.0.0/0"]).matches("203.0.113.9")).toBe(true);
    expect(createIpMatcher(["::/0"]).matches("2001:db8::5")).toBe(true);
  });

  it("reports the first invalid entry", () => {
    expect(() => createIpMatcher(["10.0.0.0/8", "10.0.0.0/40"])).toThrow(InvalidIpEntryError);
    expect(() => createIpMatcher(["proxy.local"])).toThrow('"proxy.local" is not an IP address');
  });
});

describe("parseIpList", () => {
  it("splits on commas and whitespace", () => {
    const list = parseIpList(" 127.0.0.1, ::1  172.16.0.0/12,,");
    expect(list.entries).toEqual(["127.0.0.1", "::1", "172.16.0.0/12"]);
    expect(list.isEmpty).toBe(false);
    expect(list.matches("172.20.0.3")).toBe(true);
  });

  it("is empty for an empty value", () => {
    expect(parseIpList("").isEmpty).toBe(true);
    expect(parseIpList(" , ").matches("127.0.0.1")).toBe(false);
  });
});

describe("resolveClientIp", () => {
  const trusted = parseIpList("10.0.0.2, 10.0.0.3");

  it("uses the socket address when the peer isn't a trusted proxy", () => {
    expect(resolveClientIp("203.0.113.9", "1.1.1.1", trusted)).toBe("203.0.113.9");
    expect(resolveClientIp("10.0.0.2", undefined, trusted)).toBe("10.0.0.2");
    expect(resolveClientIp(null, "1.1.1.1", trusted)).toBeNull();
  });

  it("takes the rightmost address the trusted proxies didn't vouch for", () => {
    expect(resolveClientIp("10.0.0.2", "198.51.100.7", trusted)).toBe("198.51.100.7");
    // A client-supplied entry on the left can't push the real address aside.
    expect(resolveClientIp("10.0.0.2", "6.6.6.6, 198.51.100.7, 10.0.0.3", trusted)).toBe(
      "198.51.100.7"
    );
  });

  it("falls back to the leftmost trusted hop when every hop is trusted", () => {
    expect(resolveClientIp("10.0.0.2", "10.0.0.3", trusted)).toBe("10.0.0.3");
  });

  it("stops at a garbled entry", () => {
    expect(resolveClientIp("10.0.0.2", "198.51.100.7, garbage", trusted)).toBe("10.0.0.2");
    expect(resolveClientIp("10.0.0.2", "garbage, 10.0.0.3", trusted)).toBe("10.0.0.3");
  });
});
