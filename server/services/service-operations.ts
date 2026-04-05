import { v4 as uuidv4 } from "uuid";
import { getValidationMessage, serviceCreateSchema, serviceUpdateSchema } from "@shared/schemas";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";
import { apiFail, apiOk, getErrorMessage, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { persistDownloadedIcon, persistUploadedIcon, removeStoredIcon } from "./icon-storage";
import type { ParsedServicePayload } from "./service-payloads";

type ServiceRecord = Omit<Service, "open_in_new_tab"> & {
  open_in_new_tab: boolean | number;
};

interface StoredServiceInput {
  category: string | null;
  createdAt: number;
  description: string | null;
  icon: string | null;
  id: string;
  name: string;
  openInNewTab: boolean;
  updatedAt: number;
  url: string;
}

interface UpdatedServiceInput {
  category: string | null;
  description: string | null;
  icon: string | null;
  name: string;
  openInNewTab: boolean;
  updatedAt: number;
  url: string;
}

function normalizeServiceRecord(service: ServiceRecord): Service {
  return {
    ...service,
    open_in_new_tab: Boolean(service.open_in_new_tab),
  };
}

function getServiceRecord(id: string): ServiceRecord | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM services WHERE id = ?").get(id) as ServiceRecord | undefined;
}

function createStoredService(input: StoredServiceInput): Service {
  const db = getDb();
  db.prepare(
    `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.name,
    input.url,
    input.description,
    input.icon,
    input.category,
    input.openInNewTab ? 1 : 0,
    input.createdAt,
    input.updatedAt
  );

  return normalizeServiceRecord(getServiceRecord(input.id)!);
}

function updateStoredService(id: string, input: UpdatedServiceInput): Service {
  const db = getDb();
  db.prepare(
    `UPDATE services SET
       name = ?, url = ?, description = ?, icon = ?, category = ?,
       open_in_new_tab = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name,
    input.url,
    input.description,
    input.icon,
    input.category,
    input.openInNewTab ? 1 : 0,
    input.updatedAt,
    id
  );

  return normalizeServiceRecord(getServiceRecord(id)!);
}

function deleteStoredService(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM services WHERE id = ?").run(id);
}

export function listServices(): Service[] {
  const db = getDb();
  const services = db
    .prepare("SELECT * FROM services ORDER BY category ASC, name ASC")
    .all() as ServiceRecord[];

  return services.map(normalizeServiceRecord);
}

export async function createService(
  input: ParsedServicePayload<CreateServicePayload>
): Promise<ApiResult<Service>> {
  const validation = serviceCreateSchema.safeParse(input.payload);
  if (!validation.success) {
    return apiFail(400, getValidationMessage(validation.error));
  }

  const id = uuidv4();
  const now = Date.now();
  const validatedPayload = validation.data;

  let iconFilename: string | null = null;
  try {
    if (input.iconFile) {
      iconFilename = await persistUploadedIcon(id, input.iconFile);
    } else if (validatedPayload.icon_url) {
      iconFilename = await persistDownloadedIcon(id, validatedPayload.icon_url);
    }
  } catch (error) {
    return apiFail(400, getErrorMessage(error, "failed to persist icon"));
  }

  return apiOk(
    createStoredService({
      category: validatedPayload.category,
      createdAt: now,
      description: validatedPayload.description,
      icon: iconFilename,
      id,
      name: validatedPayload.name,
      openInNewTab: validatedPayload.open_in_new_tab,
      updatedAt: now,
      url: validatedPayload.url,
    })
  );
}

export async function updateService(
  id: string,
  input: ParsedServicePayload<UpdateServicePayload>
): Promise<ApiResult<Service>> {
  const existing = getServiceRecord(id);
  if (!existing) {
    return apiFail(404, "not found");
  }

  const validation = serviceUpdateSchema.safeParse(input.payload);
  if (!validation.success) {
    return apiFail(400, getValidationMessage(validation.error));
  }

  const validatedPayload = validation.data;
  let iconFilename = existing.icon;

  const replacingIcon = Boolean(input.iconFile || validatedPayload.icon_url);
  if (!replacingIcon && input.removeIcon && existing.icon) {
    removeStoredIcon(existing.icon);
    iconFilename = null;
  }

  try {
    if (input.iconFile) {
      iconFilename = await persistUploadedIcon(id, input.iconFile, existing.icon);
    } else if (validatedPayload.icon_url) {
      iconFilename = await persistDownloadedIcon(id, validatedPayload.icon_url, existing.icon);
    }
  } catch (error) {
    return apiFail(400, getErrorMessage(error, "failed to persist icon"));
  }

  return apiOk(
    updateStoredService(id, {
      category:
        validatedPayload.category !== undefined ? validatedPayload.category : existing.category,
      description:
        validatedPayload.description !== undefined
          ? validatedPayload.description
          : existing.description,
      icon: iconFilename,
      name: validatedPayload.name !== undefined ? validatedPayload.name : existing.name,
      openInNewTab:
        validatedPayload.open_in_new_tab !== undefined
          ? validatedPayload.open_in_new_tab
          : Boolean(existing.open_in_new_tab),
      updatedAt: Date.now(),
      url: validatedPayload.url !== undefined ? validatedPayload.url : existing.url,
    })
  );
}

export function deleteService(id: string): ApiResult<{ success: true }> {
  const existing = getServiceRecord(id);
  if (!existing) {
    return apiFail(404, "not found");
  }

  removeStoredIcon(existing.icon);
  deleteStoredService(id);
  return apiOk({ success: true });
}
