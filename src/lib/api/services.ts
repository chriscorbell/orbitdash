import {
    buildApiUrl,
    invalidateRequestCache,
    request,
    requestJson,
    requestJsonCached,
} from "@/lib/api/client";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";

function appendOptionalField(
    formData: FormData,
    key: string,
    value: string | null | undefined,
    options?: { includeEmptyString?: boolean }
) {
    if (value === undefined) {
        return;
    }

    const normalizedValue = value ?? "";
    if (!options?.includeEmptyString && normalizedValue === "") {
        return;
    }

    formData.append(key, normalizedValue);
}

function appendBooleanField(formData: FormData, key: string, value: boolean | undefined) {
    if (value === undefined) {
        return;
    }

    formData.append(key, String(value));
}

function buildServiceFormData(
    payload: CreateServicePayload | UpdateServicePayload,
    options?: {
        iconFile?: File;
        removeIcon?: boolean;
        includeDefaultOpenInNewTab?: boolean;
        allowEmptyFields?: boolean;
    }
): FormData {
    const formData = new FormData();
    const includeEmptyFields = options?.allowEmptyFields ?? false;

    appendOptionalField(formData, "name", payload.name);
    appendOptionalField(formData, "url", payload.url);
    appendOptionalField(formData, "description", payload.description, {
        includeEmptyString: includeEmptyFields,
    });
    appendOptionalField(formData, "category", payload.category, {
        includeEmptyString: includeEmptyFields,
    });
    appendOptionalField(formData, "icon_url", payload.icon_url, {
        includeEmptyString: includeEmptyFields,
    });

    const openInNewTab =
        payload.open_in_new_tab ??
        (options?.includeDefaultOpenInNewTab ? true : undefined);
    appendBooleanField(formData, "open_in_new_tab", openInNewTab);

    if (options?.iconFile) {
        formData.append("icon_file", options.iconFile);
    }

    if (options?.removeIcon) {
        formData.append("remove_icon", "true");
    }

    return formData;
}

/** Fetch all services */
export async function fetchServices(): Promise<Service[]> {
    return requestJsonCached<Service[]>(
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
    const formData = buildServiceFormData(payload, {
        iconFile,
        includeDefaultOpenInNewTab: true,
    });

    const service = await requestJson<Service>(
        "/api/services",
        {
            method: "POST",
            body: formData,
        },
        "Failed to create service"
    );

    invalidateRequestCache("/api/services");
    return service;
}

/** Update a service */
export async function updateService(
    id: string,
    payload: UpdateServicePayload,
    iconFile?: File,
    removeIcon?: boolean
): Promise<Service> {
    const formData = buildServiceFormData(payload, {
        allowEmptyFields: true,
        iconFile,
        removeIcon,
    });

    const service = await requestJson<Service>(
        `/api/services/${id}`,
        {
            method: "PUT",
            body: formData,
        },
        "Failed to update service"
    );

    invalidateRequestCache("/api/services");
    return service;
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

    invalidateRequestCache("/api/services");
}

/** Build the URL for a service icon */
export function getIconUrl(iconFilename: string, cacheKey?: string | number): string {
    const path = cacheKey === undefined || cacheKey === null
        ? `/api/icons/${iconFilename}`
        : `/api/icons/${iconFilename}?v=${cacheKey}`;

    return buildApiUrl(path);
}
