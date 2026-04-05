import {
  buildApiUrl,
  invalidateRequestCache,
  request,
  requestJson,
  requestJsonCached,
} from "@/lib/api/client";
import { serviceSchema, servicesResponseSchema } from "@shared/schemas";
import { buildServiceFormData } from "@shared/service-form-data";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";

/** Fetch all services */
export async function fetchServices(): Promise<Service[]> {
  return requestJsonCached("/api/services", {}, "Failed to fetch services", servicesResponseSchema);
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
    "Failed to create service",
    serviceSchema
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
    "Failed to update service",
    serviceSchema
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
  const path =
    cacheKey === undefined || cacheKey === null
      ? `/api/icons/${iconFilename}`
      : `/api/icons/${iconFilename}?v=${cacheKey}`;

  return buildApiUrl(path);
}
