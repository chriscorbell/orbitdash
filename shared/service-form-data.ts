import type { CreateServicePayload, UpdateServicePayload } from "./types";

type ServiceFormDataEntry = string | File;

export interface ServiceFormDataReader {
  get(name: string): ServiceFormDataEntry | null;
}

export const SERVICE_FORM_DATA_KEYS = {
  category: "category",
  description: "description",
  iconFile: "icon_file",
  iconUrl: "icon_url",
  name: "name",
  openInNewTab: "open_in_new_tab",
  removeIcon: "remove_icon",
  url: "url",
} as const;

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

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readOptionalString(formData: ServiceFormDataReader, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) {
    return undefined;
  }

  return String(value);
}

export function buildServiceFormData(
  payload: CreateServicePayload | UpdateServicePayload,
  options?: {
    allowEmptyFields?: boolean;
    iconFile?: File;
    includeDefaultOpenInNewTab?: boolean;
    removeIcon?: boolean;
  }
): FormData {
  const formData = new FormData();
  const includeEmptyFields = options?.allowEmptyFields ?? false;

  appendOptionalField(formData, SERVICE_FORM_DATA_KEYS.name, payload.name);
  appendOptionalField(formData, SERVICE_FORM_DATA_KEYS.url, payload.url);
  appendOptionalField(formData, SERVICE_FORM_DATA_KEYS.description, payload.description, {
    includeEmptyString: includeEmptyFields,
  });
  appendOptionalField(formData, SERVICE_FORM_DATA_KEYS.category, payload.category, {
    includeEmptyString: includeEmptyFields,
  });
  appendOptionalField(formData, SERVICE_FORM_DATA_KEYS.iconUrl, payload.icon_url, {
    includeEmptyString: includeEmptyFields,
  });

  const openInNewTab =
    payload.open_in_new_tab ?? (options?.includeDefaultOpenInNewTab ? true : undefined);
  appendBooleanField(formData, SERVICE_FORM_DATA_KEYS.openInNewTab, openInNewTab);

  if (options?.iconFile) {
    formData.append(SERVICE_FORM_DATA_KEYS.iconFile, options.iconFile);
  }

  if (options?.removeIcon) {
    formData.append(SERVICE_FORM_DATA_KEYS.removeIcon, "true");
  }

  return formData;
}

export function createServicePayloadFromFormData(
  formData: ServiceFormDataReader
): CreateServicePayload {
  return {
    name: String(formData.get(SERVICE_FORM_DATA_KEYS.name) ?? ""),
    url: String(formData.get(SERVICE_FORM_DATA_KEYS.url) ?? ""),
    description: trimToNull(readOptionalString(formData, SERVICE_FORM_DATA_KEYS.description)),
    category: trimToNull(readOptionalString(formData, SERVICE_FORM_DATA_KEYS.category)),
    icon_url: trimToNull(readOptionalString(formData, SERVICE_FORM_DATA_KEYS.iconUrl)),
    open_in_new_tab: formData.get(SERVICE_FORM_DATA_KEYS.openInNewTab) !== "false",
  };
}

export function updateServicePayloadFromFormData(
  formData: ServiceFormDataReader
): UpdateServicePayload {
  const payload: UpdateServicePayload = {};
  const name = readOptionalString(formData, SERVICE_FORM_DATA_KEYS.name);
  const url = readOptionalString(formData, SERVICE_FORM_DATA_KEYS.url);
  const description = readOptionalString(formData, SERVICE_FORM_DATA_KEYS.description);
  const category = readOptionalString(formData, SERVICE_FORM_DATA_KEYS.category);
  const iconUrl = readOptionalString(formData, SERVICE_FORM_DATA_KEYS.iconUrl);
  const openInNewTab = formData.get(SERVICE_FORM_DATA_KEYS.openInNewTab);

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

export function readServiceMultipartMetadata(formData: ServiceFormDataReader) {
  const file = formData.get(SERVICE_FORM_DATA_KEYS.iconFile);

  return {
    iconFile: file instanceof File && file.size > 0 ? file : null,
    removeIcon: formData.get(SERVICE_FORM_DATA_KEYS.removeIcon) === "true",
  };
}
