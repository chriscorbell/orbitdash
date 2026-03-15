const SERVICE_PROTOCOLS = new Set(["http:", "https:"]);
const ICON_HOSTS = new Set(["dashboardicons.com", "www.dashboardicons.com"]);

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
    if (!parsed || parsed.protocol !== "https:" || !ICON_HOSTS.has(parsed.hostname)) {
        return null;
    }

    return parsed.toString();
}
