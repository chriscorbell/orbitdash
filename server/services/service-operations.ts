import {
  getValidationMessage,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@shared/service-schemas";
import type {
  Service,
  CreateServicePayload,
  MoveServicePayload,
  ReorderServicesPayload,
  UpdateServicePayload,
} from "@shared/types";
import { apiFail, apiOk, getErrorMessage, type ApiResult } from "../api-response";
import { getDb } from "../db";
import { getCategory, nextServicePosition, resolveCategoryId } from "./category-store";
import {
  copyStoredIcon,
  persistDownloadedIcon,
  persistUploadedIcon,
  removeStoredIcon,
} from "./icon-storage";
import type { ParsedServicePayload } from "./service-payloads";

type ServiceRecord = Omit<Service, "open_in_new_tab"> & {
  open_in_new_tab: boolean | number;
};

interface StoredServiceInput {
  categoryId: string | null;
  createdAt: number;
  description: string | null;
  icon: string | null;
  id: string;
  name: string;
  openInNewTab: boolean;
  position: number;
  updatedAt: number;
  url: string;
}

interface UpdatedServiceInput {
  categoryId: string | null;
  description: string | null;
  icon: string | null;
  name: string;
  openInNewTab: boolean;
  position: number;
  updatedAt: number;
  url: string;
}

const SERVICE_SELECT = `SELECT services.*, categories.name AS category
  FROM services LEFT JOIN categories ON categories.id = services.category_id`;

function normalizeServiceRecord(service: ServiceRecord): Service {
  return {
    ...service,
    open_in_new_tab: Boolean(service.open_in_new_tab),
  };
}

function getServiceRecord(id: string): ServiceRecord | undefined {
  const db = getDb();
  return db.prepare(`${SERVICE_SELECT} WHERE services.id = ?`).get(id) as ServiceRecord | undefined;
}

function createStoredService(input: StoredServiceInput): Service {
  const db = getDb();
  db.prepare(
    `INSERT INTO services (id, name, url, description, icon, category_id, position, open_in_new_tab, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.name,
    input.url,
    input.description,
    input.icon,
    input.categoryId,
    input.position,
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
       name = ?, url = ?, description = ?, icon = ?, category_id = ?, position = ?,
       open_in_new_tab = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name,
    input.url,
    input.description,
    input.icon,
    input.categoryId,
    input.position,
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
  // Categories in their saved order, uncategorized last, then each service's position.
  const services = db
    .prepare(
      `${SERVICE_SELECT}
       ORDER BY categories.position IS NULL, categories.position ASC, services.position ASC,
                services.name ASC`
    )
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

  const id = crypto.randomUUID();
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

  const categoryId = resolveCategoryId(validatedPayload.category);
  return apiOk(
    createStoredService({
      categoryId,
      createdAt: now,
      description: validatedPayload.description,
      icon: iconFilename,
      id,
      name: validatedPayload.name,
      openInNewTab: validatedPayload.open_in_new_tab,
      position: nextServicePosition(categoryId),
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

  // A service that changes category goes to the end of its new one.
  const categoryId =
    validatedPayload.category !== undefined
      ? resolveCategoryId(validatedPayload.category)
      : existing.category_id;
  const position =
    categoryId === existing.category_id ? existing.position : nextServicePosition(categoryId);

  return apiOk(
    updateStoredService(id, {
      categoryId,
      position,
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

export function duplicateService(id: string): ApiResult<Service> {
  const existing = getServiceRecord(id);
  if (!existing) {
    return apiFail(404, "not found");
  }

  const newId = crypto.randomUUID();
  const now = Date.now();
  const db = getDb();

  // The copy goes right after the original.
  const duplicate = db.transaction(() => {
    db.prepare(
      "UPDATE services SET position = position + 1 WHERE category_id IS ? AND position > ?"
    ).run(existing.category_id, existing.position);

    return createStoredService({
      categoryId: existing.category_id,
      position: existing.position + 1,
      createdAt: now,
      description: existing.description,
      icon: copyStoredIcon(existing.icon, newId),
      id: newId,
      name: `${existing.name} (copy)`,
      openInNewTab: Boolean(existing.open_in_new_tab),
      updatedAt: now,
      url: existing.url,
    });
  });

  return apiOk(duplicate());
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

function listServiceIdsInCategory(categoryId: string | null, excludeId?: string): string[] {
  return (
    getDb()
      .prepare("SELECT id FROM services WHERE category_id IS ? ORDER BY position ASC, name ASC")
      .all(categoryId) as Array<{ id: string }>
  )
    .map((row) => row.id)
    .filter((id) => id !== excludeId);
}

function writePositions(categoryId: string | null, ids: readonly string[]): void {
  const update = getDb().prepare(
    "UPDATE services SET category_id = ?, position = ?, updated_at = ? WHERE id = ?"
  );
  const now = Date.now();
  ids.forEach((id, position) => update.run(categoryId, position, now, id));
}

/** Moves a service into a category (null = uncategorized) at `index`, renumbering both sides. */
export function moveService(id: string, input: MoveServicePayload): ApiResult<Service> {
  const existing = getServiceRecord(id);
  if (!existing) {
    return apiFail(404, "not found");
  }
  if (input.category_id !== null && !getCategory(input.category_id)) {
    return apiFail(404, "category not found");
  }

  const db = getDb();
  db.transaction(() => {
    if (existing.category_id !== input.category_id) {
      writePositions(existing.category_id, listServiceIdsInCategory(existing.category_id, id));
    }
    const target = listServiceIdsInCategory(input.category_id, id);
    target.splice(Math.min(input.index, target.length), 0, id);
    writePositions(input.category_id, target);
  })();

  return apiOk(normalizeServiceRecord(getServiceRecord(id)!));
}

/**
 * Orders the services of one category: listed ids first in the given order, any others after.
 * Ids that belong to another category are ignored.
 */
export function reorderServices(input: ReorderServicesPayload): ApiResult<Service[]> {
  if (input.category_id !== null && !getCategory(input.category_id)) {
    return apiFail(404, "category not found");
  }

  const current = listServiceIdsInCategory(input.category_id);
  const listed = [...new Set(input.ids)].filter((id) => current.includes(id));
  const rest = current.filter((id) => !listed.includes(id));

  getDb().transaction(() => writePositions(input.category_id, [...listed, ...rest]))();
  return apiOk(listServices());
}
