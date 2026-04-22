const SERVICE_PROTOCOLS = new Set(["http:", "https:"]);

function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

function parseServiceUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.includes("://")) {
    return parseUrl(trimmed);
  }

  return parseUrl(`https://${trimmed}`);
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
