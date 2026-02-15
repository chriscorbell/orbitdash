import type { MetricSample, Service, CreateServicePayload, UpdateServicePayload, MetricsResponse } from "@/shared/types";

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

/** Fetch recent metric samples */
export async function fetchMetrics(windowSec: number = 30): Promise<MetricSample[]> {
    const res = await fetch(`${API_BASE}/api/metrics?window=${windowSec}`);
    if (!res.ok) throw new Error("Failed to fetch metrics");
    const data: MetricsResponse = await res.json();
    return data.samples;
}

/** Subscribe to SSE metric stream. Returns a cleanup function. */
export function subscribeMetrics(
    onSample: (sample: MetricSample) => void,
    onError?: (err: Event) => void
): () => void {
    const es = new EventSource(`${API_BASE}/api/metrics/stream`);

    es.addEventListener("sample", (e) => {
        try {
            const sample: MetricSample = JSON.parse(e.data);
            onSample(sample);
        } catch {
            // ignore malformed events
        }
    });

    es.onerror = (e) => {
        onError?.(e);
    };

    return () => {
        es.close();
    };
}

/** Fetch all services */
export async function fetchServices(): Promise<Service[]> {
    const res = await fetch(`${API_BASE}/api/services`);
    if (!res.ok) throw new Error("Failed to fetch services");
    return res.json();
}

/** Create a new service (with optional icon file upload) */
export async function createService(
    payload: CreateServicePayload,
    iconFile?: File
): Promise<Service> {
    const formData = new FormData();
    formData.append("name", payload.name);
    formData.append("url", payload.url);
    if (payload.description) formData.append("description", payload.description);
    if (payload.category) formData.append("category", payload.category);
    if (payload.icon_url) formData.append("icon_url", payload.icon_url);
    formData.append("open_in_new_tab", String(payload.open_in_new_tab ?? true));
    if (iconFile) formData.append("icon_file", iconFile);

    const res = await fetch(`${API_BASE}/api/services`, {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error("Failed to create service");
    return res.json();
}

/** Update a service */
export async function updateService(
    id: string,
    payload: UpdateServicePayload,
    iconFile?: File,
    removeIcon?: boolean
): Promise<Service> {
    const formData = new FormData();
    if (payload.name !== undefined) formData.append("name", payload.name);
    if (payload.url !== undefined) formData.append("url", payload.url);
    if (payload.description !== undefined) formData.append("description", payload.description || "");
    if (payload.category !== undefined) formData.append("category", payload.category || "");
    if (payload.icon_url !== undefined) formData.append("icon_url", payload.icon_url || "");
    if (payload.open_in_new_tab !== undefined) formData.append("open_in_new_tab", String(payload.open_in_new_tab));
    if (iconFile) formData.append("icon_file", iconFile);
    if (removeIcon) formData.append("remove_icon", "true");

    const res = await fetch(`${API_BASE}/api/services/${id}`, {
        method: "PUT",
        body: formData,
    });
    if (!res.ok) throw new Error("Failed to update service");
    return res.json();
}

/** Delete a service */
export async function deleteService(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/services/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete service");
}

/** Build the URL for a service icon */
export function getIconUrl(iconFilename: string, cacheKey?: string | number): string {
    if (cacheKey === undefined || cacheKey === null) {
        return `${API_BASE}/api/icons/${iconFilename}`;
    }
    return `${API_BASE}/api/icons/${iconFilename}?v=${cacheKey}`;
}
