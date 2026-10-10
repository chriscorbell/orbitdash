import type { LinkPreference } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";

/** Which of a service's URLs to open: its main (internal) one, or its external one. */
export type LinkTarget = "internal" | "external";

const PRIVATE_SUFFIX = /(^|\.)(localhost|local|lan|home|internal|localdomain|home\.arpa|ts\.net)$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/;
// An IPv4 address mapped into IPv6, as browsers write it: ::ffff:a00:14 for 10.0.0.20.
const MAPPED_IPV4 = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/;

/**
 * 10/8, 172.16/12, 192.168/16, loopback, link-local, "this network", and 100.64/10, the shared
 * address space Tailscale hands out.
 */
function isPrivateIPv4(a: number, b: number): boolean {
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * True for an address only your own network or tailnet reaches: localhost, private and CGNAT
 * IPv4, IPv6 loopback, unique local (fc00::/7) and link-local (fe80::/10) addresses, single-label
 * names like `nas`, and the usual private suffixes (.local, .lan, .home.arpa, .internal, .ts.net).
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (host.includes(":")) {
    const mapped = MAPPED_IPV4.exec(host);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      return isPrivateIPv4(high >> 8, high & 255);
    }
    return host === "::1" || /^(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(host);
  }

  const ipv4 = IPV4.exec(host);
  if (ipv4) return isPrivateIPv4(Number(ipv4[1]), Number(ipv4[2]));
  return !host.includes(".") || PRIVATE_SUFFIX.test(host);
}

/** The URL cards open: the preference, or for auto, internal when this page is on a private address. */
export function resolveLinkTarget(preference: LinkPreference, hostname: string): LinkTarget {
  if (preference !== "auto") return preference;
  return isPrivateHostname(hostname) ? "internal" : "external";
}

/** A service's URL for a target; one without an external URL always opens its main one. */
export function serviceHref(
  service: Pick<Service, "external_url" | "url">,
  target: LinkTarget
): string {
  return target === "external" ? (service.external_url ?? service.url) : service.url;
}
