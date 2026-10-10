/**
 * IP parsing and CIDR matching for the trusted-proxy list. Addresses are compared as integers.
 * An IPv4-mapped IPv6 address (`::ffff:10.0.0.1`, what a dual-stack socket reports for an IPv4
 * client) counts as the IPv4 address it carries, so one list entry covers both spellings.
 */

interface ParsedIp {
  value: bigint;
  version: 4 | 6;
}

interface CidrRange extends ParsedIp {
  prefix: number;
}

const BITS = { 4: 32, 6: 128 } as const;
const IPV4_MAPPED_PREFIX = 0xffffn << 32n;

function parseIpv4(input: string): bigint | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;

  let value = 0n;
  for (const part of parts) {
    // No leading zeros: "010" means octal to some tools, so refuse to guess.
    if (!/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) return null;
    value = (value << 8n) | BigInt(part);
  }
  return value;
}

function parseGroups(text: string): bigint[] | null {
  if (text === "") return [];
  const groups: bigint[] = [];
  for (const group of text.split(":")) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    groups.push(BigInt(`0x${group}`));
  }
  return groups;
}

function parseIpv6(input: string): bigint | null {
  let address = input;
  const ipv4Groups: bigint[] = [];

  // An embedded IPv4 address fills the last two groups (`::ffff:192.0.2.1`).
  const lastColon = address.lastIndexOf(":");
  const last = address.slice(lastColon + 1);
  if (last.includes(".")) {
    const ipv4 = parseIpv4(last);
    if (ipv4 === null) return null;
    ipv4Groups.push(ipv4 >> 16n, ipv4 & 0xffffn);
    address = address.slice(0, lastColon + 1);
    if (!address.endsWith("::")) address = address.slice(0, -1);
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = parseGroups(halves[0]);
  const tail = parseGroups(halves[1] ?? "");
  if (head === null || tail === null) return null;

  const wanted = 8 - ipv4Groups.length;
  let groups = head;
  if (halves.length === 2) {
    // "::" stands for one or more groups of zeros.
    const missing = wanted - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<bigint>(missing).fill(0n), ...tail];
  } else if (head.length !== wanted) {
    return null;
  }

  return [...groups, ...ipv4Groups].reduce((value, group) => (value << 16n) | group, 0n);
}

/** Parses an IPv4 or IPv6 address (brackets and zone ids allowed), or returns null. */
export function parseIp(input: string): ParsedIp | null {
  let address = input.trim();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);

  if (!address.includes(":")) {
    const value = parseIpv4(address);
    return value === null ? null : { version: 4, value };
  }

  const value = parseIpv6(address);
  if (value === null) return null;
  if (value >> 32n === 0xffffn) {
    return { version: 4, value: value & 0xffffffffn };
  }
  return { version: 6, value };
}

/** Parses `address` or `address/prefix`; a lone address is a single-host range. */
export function parseCidr(input: string): CidrRange | null {
  const [addressPart, prefixPart, ...extra] = input.trim().split("/");
  if (extra.length > 0) return null;
  const ip = parseIp(addressPart);
  if (!ip) return null;

  let range: ParsedIp = ip;
  let prefix: number = BITS[ip.version];
  if (prefixPart !== undefined) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);

    // An IPv4-mapped range (::ffff:10.0.0.0/104) narrows the IPv4 part; a wider one stays IPv6.
    if (ip.version === 4 && addressPart.includes(":")) {
      if (prefix >= 96) {
        prefix -= 96;
      } else {
        range = { version: 6, value: IPV4_MAPPED_PREFIX | ip.value };
      }
    }
    if (prefix > BITS[range.version]) return null;
  }

  const shift = BigInt(BITS[range.version] - prefix);
  return { version: range.version, value: (range.value >> shift) << shift, prefix };
}

function inRange(ip: ParsedIp, range: CidrRange): boolean {
  if (ip.version !== range.version) return false;
  const shift = BigInt(BITS[range.version] - range.prefix);
  return ip.value >> shift === range.value >> shift;
}

export interface IpMatcher {
  /** The entries as configured, for logs. */
  readonly entries: readonly string[];
  readonly isEmpty: boolean;
  matches: (address: string | null | undefined) => boolean;
}

export class InvalidIpEntryError extends Error {
  constructor(readonly entry: string) {
    super(`"${entry}" is not an IP address or CIDR range`);
    this.name = "InvalidIpEntryError";
  }
}

/** Builds a matcher from IP or CIDR entries; throws InvalidIpEntryError on the first bad one. */
export function createIpMatcher(entries: readonly string[]): IpMatcher {
  const ranges = entries.map((entry) => {
    const range = parseCidr(entry);
    if (!range) throw new InvalidIpEntryError(entry);
    return range;
  });

  return {
    entries: [...entries],
    isEmpty: ranges.length === 0,
    matches: (address) => {
      const ip = address ? parseIp(address) : null;
      return ip !== null && ranges.some((range) => inRange(ip, range));
    },
  };
}

/** Splits a comma- or space-separated list such as `ORBITDASH_TRUSTED_PROXIES`. */
export function parseIpList(value: string): IpMatcher {
  return createIpMatcher(value.split(/[\s,]+/).filter((entry) => entry !== ""));
}

/**
 * The client's address. X-Forwarded-For only counts when the socket peer is a trusted proxy. It is
 * read right to left, skipping the trusted proxies that appended to it; the first address none of
 * them vouches for is the client. A garbled entry ends the walk, since nothing left of it can be
 * trusted.
 */
export function resolveClientIp(
  socketIp: string | null,
  forwardedFor: string | null | undefined,
  trustedProxies: IpMatcher
): string | null {
  if (!socketIp || !forwardedFor || !trustedProxies.matches(socketIp)) {
    return socketIp;
  }

  let client = socketIp;
  const hops = forwardedFor.split(",").map((hop) => hop.trim());
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    if (parseIp(hop) === null) break;
    client = hop;
    if (!trustedProxies.matches(hop)) break;
  }
  return client;
}
