import { buildApiUrl, request, requestJson } from "@/lib/api/client";
import { serviceSchema, servicesResponseSchema } from "@/lib/api/schemas";
import { buildServiceFormData } from "@shared/service-form-data";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";

export function fetchServices(): Promise<Service[]> {
  return requestJson("/api/services", {}, "Failed to fetch services", servicesResponseSchema);
}

/** Create a new service (with optional icon file upload) */
export function createService(payload: CreateServicePayload, iconFile?: File): Promise<Service> {
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

export function updateService(
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

export async function deleteService(id: string): Promise<void> {
  await request(`/api/services/${id}`, { method: "DELETE" }, "Failed to delete service");
}

/** Get icon URL for display; `version` busts the browser cache when the icon changes. */
export function getIconUrl(iconFilename: string, version?: number): string {
  const iconUrl = buildApiUrl(`/api/icons/${iconFilename}`);
  return version === undefined ? iconUrl : `${iconUrl}?v=${version}`;
}
