const SERVICE_PROTOCOLS = new Set(["http:", "https:"]);
const LAN_HOST_SUFFIXES = [".local", ".lan", ".home", ".internal", ".home.arpa"];
const IPV4_HOSTNAME = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

/**
 * Hosts that usually serve plain HTTP on a home network: IP literals, single-label names such as
 * `nas` or `localhost`, and the common private suffixes.
 */
function isLanHostname(hostname: string): boolean {
  const host = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (host.startsWith("[") || IPV4_HOSTNAME.test(host) || !host.includes(".")) {
    return true;
  }

  return LAN_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function parseServiceUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.includes("://")) {
    return parseUrl(trimmed);
  }

  // Parsing as https drops an explicit :443, so any port left over is a hint the app is not TLS.
  const parsed = parseUrl(`https://${trimmed}`);
  if (parsed && (parsed.port !== "" || isLanHostname(parsed.hostname))) {
    parsed.protocol = "http:";
  }

  return parsed;
}

export function normalizeServiceUrl(input: string): string | null {
  const parsed = parseServiceUrl(input);
  if (!parsed || !SERVICE_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  return parsed.toString();
}

export function normalizeIconUrl(input: string): string | null {
  const parsed = parseUrl(input);
  if (!parsed || !SERVICE_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  return parsed.toString();
}
