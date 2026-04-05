const SERVICE_PROTOCOLS = new Set(["http:", "https:"]);

function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

export function normalizeServiceUrl(input: string): string | null {
  const parsed = parseUrl(input);
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
