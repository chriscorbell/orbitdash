import { buildApiUrl, jsonBody, request, requestJson } from "@/lib/api/client";
import { serviceSchema, servicesResponseSchema } from "@/lib/api/schemas";
import type {
  CreateServicePayload,
  MoveServicePayload,
  Service,
  UpdateServicePayload,
} from "@shared/types";

// Only saving from the service dialog builds this form, so it loads with the first save instead of
// with the page (the offline worker has it precached in production).
const loadServiceFormData = () => import("@shared/service-form-data");

export function fetchServices(): Promise<Service[]> {
  return requestJson("/api/services", {}, "Failed to fetch services", servicesResponseSchema);
}

/** Create a new service (with optional icon file upload) */
export async function createService(
  payload: CreateServicePayload,
  iconFile?: File
): Promise<Service> {
  const { buildServiceFormData } = await loadServiceFormData();
  const formData = buildServiceFormData(payload, {
    iconFile,
    includeDefaultOpenInNewTab: true,
  });

  return requestJson(
    "/api/services",
    { method: "POST", body: formData },
    "Failed to create service",
    serviceSchema
  );
}

export async function updateService(
  id: string,
  payload: UpdateServicePayload,
  iconFile?: File,
  removeIcon?: boolean
): Promise<Service> {
  const { buildServiceFormData } = await loadServiceFormData();
  const formData = buildServiceFormData(payload, {
    allowEmptyFields: true,
    iconFile,
    removeIcon,
  });

  return requestJson(
    `/api/services/${id}`,
    { method: "PUT", body: formData },
    "Failed to update service",
    serviceSchema
  );
}

export function duplicateService(id: string): Promise<Service> {
  return requestJson(
    `/api/services/${id}/duplicate`,
    { method: "POST" },
    "Failed to duplicate service",
    serviceSchema
  );
}

/** Deletes into the server's trash; `restoreService` can bring it back for a while. */
export async function deleteService(id: string): Promise<void> {
  await request(`/api/services/${id}`, { method: "DELETE" }, "Failed to delete service");
}

export function restoreService(id: string): Promise<Service> {
  return requestJson(
    `/api/services/${id}/restore`,
    { method: "POST" },
    "Failed to restore service",
    serviceSchema
  );
}

/** Moves a service to a category (null = uncategorized) at an index; the server renumbers. */
export function moveService(id: string, payload: MoveServicePayload): Promise<Service> {
  return requestJson(
    `/api/services/${id}/move`,
    jsonBody("POST", payload),
    "Failed to move service",
    serviceSchema
  );
}

/** Get icon URL for display; `version` busts the browser cache when the icon changes. */
export function getIconUrl(iconFilename: string, version?: number): string {
  const iconUrl = buildApiUrl(`/api/icons/${iconFilename}`);
  return version === undefined ? iconUrl : `${iconUrl}?v=${version}`;
}
