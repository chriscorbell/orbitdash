const API_BASE = "";

async function throwIfNotOk(res: Response, fallbackMessage: string): Promise<void> {
    if (res.ok) {
        return;
    }

    let message = fallbackMessage;
    try {
        const data = await res.json() as { error?: string };
        if (data.error) {
            message = data.error;
        }
    } catch {
        // Fall back to the default message when the response body is not JSON.
    }

    throw new Error(message);
}

export async function request(path: string, init: RequestInit, fallbackMessage: string): Promise<Response> {
    const res = await fetch(`${API_BASE}${path}`, init);
    await throwIfNotOk(res, fallbackMessage);
    return res;
}

export async function requestJson<T>(
    path: string,
    init: RequestInit,
    fallbackMessage: string
): Promise<T> {
    const res = await request(path, init, fallbackMessage);
    return res.json() as Promise<T>;
}

export function buildApiUrl(path: string): string {
    return `${API_BASE}${path}`;
}
