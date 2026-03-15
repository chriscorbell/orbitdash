import { buildApiUrl, request, requestJson } from "@/lib/api/client";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";

/** Fetch all services */
export async function fetchServices(): Promise<Service[]> {
    return requestJson<Service[]>(
        "/api/services",
        {},
        "Failed to fetch services"
    );
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

    return requestJson<Service>(
        "/api/services",
        {
            method: "POST",
            body: formData,
        },
        "Failed to create service"
    );
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
    if (payload.open_in_new_tab !== undefined) {
        formData.append("open_in_new_tab", String(payload.open_in_new_tab));
    }
    if (iconFile) formData.append("icon_file", iconFile);
    if (removeIcon) formData.append("remove_icon", "true");

    return requestJson<Service>(
        `/api/services/${id}`,
        {
            method: "PUT",
            body: formData,
        },
        "Failed to update service"
    );
}

/** Delete a service */
export async function deleteService(id: string): Promise<void> {
    await request(
        `/api/services/${id}`,
        {
            method: "DELETE",
        },
        "Failed to delete service"
    );
}

/** Build the URL for a service icon */
export function getIconUrl(iconFilename: string, cacheKey?: string | number): string {
    const path = cacheKey === undefined || cacheKey === null
        ? `/api/icons/${iconFilename}`
        : `/api/icons/${iconFilename}?v=${cacheKey}`;

    return buildApiUrl(path);
}
