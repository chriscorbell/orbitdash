import type { CreateServicePayload, UpdateServicePayload } from "@shared/types";
import { hasJsonContentType, parseJsonBody } from "../request-body";

type RequestFormData = Awaited<ReturnType<Request["formData"]>>;

export interface ParsedServicePayload<TPayload> {
  iconFile: File | null;
  payload: TPayload;
  removeIcon: boolean;
}

export interface ServicePayloadParseFailure {
  error: string;
  status: 400 | 415;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readOptionalString(formData: RequestFormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) {
    return undefined;
  }

  return String(value);
}

async function parseServicePayload<TPayload extends CreateServicePayload | UpdateServicePayload>(
  request: Request,
  createPayload: (formData: RequestFormData) => TPayload
): Promise<ParsedServicePayload<TPayload> | ServicePayloadParseFailure> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("icon_file");
    const iconFile = file instanceof File && file.size > 0 ? file : null;

    return {
      iconFile,
      payload: createPayload(formData),
      removeIcon: formData.get("remove_icon") === "true",
    };
  }

  if (hasJsonContentType(contentType)) {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.success) {
      return {
        error: parsedBody.error ?? "request body must be valid JSON",
        status: parsedBody.status ?? 400,
      };
    }

    return {
      iconFile: null,
      payload: parsedBody.data as TPayload,
      removeIcon: false,
    };
  }

  return {
    error: "content-type must be application/json or multipart/form-data",
    status: 415,
  };
}

function createServicePayloadFromFormData(formData: RequestFormData): CreateServicePayload {
  return {
    name: String(formData.get("name") ?? ""),
    url: String(formData.get("url") ?? ""),
    description: trimToNull(readOptionalString(formData, "description")),
    category: trimToNull(readOptionalString(formData, "category")),
    icon_url: trimToNull(readOptionalString(formData, "icon_url")),
    open_in_new_tab: formData.get("open_in_new_tab") !== "false",
  };
}

function updateServicePayloadFromFormData(formData: RequestFormData): UpdateServicePayload {
  const payload: UpdateServicePayload = {};
  const name = readOptionalString(formData, "name");
  const url = readOptionalString(formData, "url");
  const description = readOptionalString(formData, "description");
  const category = readOptionalString(formData, "category");
  const iconUrl = readOptionalString(formData, "icon_url");
  const openInNewTab = formData.get("open_in_new_tab");

  if (name !== undefined) {
    payload.name = name;
  }
  if (url !== undefined) {
    payload.url = url;
  }
  if (description !== undefined) {
    payload.description = trimToNull(description);
  }
  if (category !== undefined) {
    payload.category = trimToNull(category);
  }
  if (iconUrl !== undefined) {
    payload.icon_url = trimToNull(iconUrl);
  }
  if (openInNewTab !== null) {
    payload.open_in_new_tab = openInNewTab !== "false";
  }

  return payload;
}

export function parseCreateServiceRequest(
  request: Request
): Promise<ParsedServicePayload<CreateServicePayload> | ServicePayloadParseFailure> {
  return parseServicePayload(request, createServicePayloadFromFormData);
}

export function parseUpdateServiceRequest(
  request: Request
): Promise<ParsedServicePayload<UpdateServicePayload> | ServicePayloadParseFailure> {
  return parseServicePayload(request, updateServicePayloadFromFormData);
}
