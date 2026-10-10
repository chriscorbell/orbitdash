import { useId, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { getIconUrl } from "@/lib/api/services";
import { randomId } from "@/lib/random-id";
import { normalizeServiceLinks } from "@shared/service-links";
import { DEFAULT_CHECK_CONFIG, normalizeCheckTarget } from "@shared/status";
import { normalizeTags } from "@shared/tags";
import type { CreateServicePayload, Service, StatusCheckMethod } from "@shared/types";
import { normalizeIconUrl, normalizeServiceUrl } from "@shared/urls";

export const NEW_CATEGORY_VALUE = "__new__";
export const NONE_CATEGORY_VALUE = "__none__";

/** A link row in the form; the id only keys the row while editing. */
export interface ServiceLinkDraft {
  id: string;
  label: string;
  url: string;
}

export interface ServiceDialogFormState {
  checkEnabled: boolean;
  checkIgnoreTls: boolean;
  checkInterval: number;
  checkMethod: StatusCheckMethod;
  checkTarget: string;
  description: string;
  externalUrl: string;
  iconPreview: string | null;
  iconUrl: string;
  links: ServiceLinkDraft[];
  name: string;
  newCategory: string;
  openInNewTab: boolean;
  removeIcon: boolean;
  selectedCategory: string;
  /** Text typed in the tag input but not yet turned into a tag; saving keeps it. */
  tagDraft: string;
  tags: string[];
  url: string;
}

export interface ServiceDialogFieldIds {
  categoryInputId: string;
  checkEnabledInputId: string;
  checkIgnoreTlsInputId: string;
  checkIntervalInputId: string;
  checkMethodInputId: string;
  checkTargetInputId: string;
  descriptionInputId: string;
  externalUrlInputId: string;
  iconFileInputId: string;
  iconUrlInputId: string;
  nameInputId: string;
  newCategoryInputId: string;
  newTabInputId: string;
  tagsInputId: string;
  urlInputId: string;
}

interface UseServiceDialogStateOptions {
  categoryOptions: string[];
  defaultCategory?: string | null;
  service?: Service | null;
}

function getServiceIconPreview(service?: Service | null) {
  return service?.icon ? getIconUrl(service.icon, service.updated_at) : null;
}

function resolveInitialCategoryState(
  service: Service | null | undefined,
  categoryOptions: string[],
  defaultCategory?: string | null
) {
  const initialCategory = (service ? service.category : defaultCategory)?.trim() ?? "";

  if (!initialCategory) {
    return {
      newCategory: "",
      selectedCategory: NONE_CATEGORY_VALUE,
    };
  }

  if (categoryOptions.includes(initialCategory)) {
    return {
      newCategory: "",
      selectedCategory: initialCategory,
    };
  }

  return {
    newCategory: initialCategory,
    selectedCategory: NEW_CATEGORY_VALUE,
  };
}

export function createInitialFormState(
  service: Service | null | undefined,
  categoryOptions: string[],
  defaultCategory?: string | null
): ServiceDialogFormState {
  const categoryState = resolveInitialCategoryState(service, categoryOptions, defaultCategory);

  return {
    checkEnabled: service?.check_enabled ?? DEFAULT_CHECK_CONFIG.check_enabled,
    checkIgnoreTls: service?.check_ignore_tls ?? DEFAULT_CHECK_CONFIG.check_ignore_tls,
    checkInterval: service?.check_interval ?? DEFAULT_CHECK_CONFIG.check_interval,
    checkMethod: service?.check_method ?? DEFAULT_CHECK_CONFIG.check_method,
    checkTarget: service?.check_target ?? "",
    description: service?.description ?? "",
    externalUrl: service?.external_url ?? "",
    iconPreview: getServiceIconPreview(service),
    iconUrl: "",
    links: (service?.links ?? []).map((link) => ({ ...link, id: randomId() })),
    name: service?.name ?? "",
    newCategory: categoryState.newCategory,
    openInNewTab: service?.open_in_new_tab ?? true,
    removeIcon: false,
    selectedCategory: categoryState.selectedCategory,
    tagDraft: "",
    tags: service?.tags ?? [],
    url: service?.url ?? "",
  };
}

function resetFileInput(fileInputRef: RefObject<HTMLInputElement | null>) {
  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
}

export function resolveSelectedCategory(formState: ServiceDialogFormState): string | null {
  if (formState.selectedCategory === NEW_CATEGORY_VALUE) {
    return formState.newCategory.trim() || null;
  }

  if (formState.selectedCategory === NONE_CATEGORY_VALUE) {
    return null;
  }

  return formState.selectedCategory.trim() || null;
}

export function buildServicePayload(formState: ServiceDialogFormState): CreateServicePayload {
  return {
    name: formState.name.trim(),
    url: formState.url.trim(),
    external_url: formState.externalUrl.trim() || null,
    links: formState.links.map(({ label, url }) => ({ label, url })),
    tags: [...formState.tags, formState.tagDraft],
    description: formState.description.trim() || null,
    icon_url: formState.iconUrl.trim() || null,
    category: resolveSelectedCategory(formState),
    open_in_new_tab: formState.openInNewTab,
    check_enabled: formState.checkEnabled,
    check_method: formState.checkMethod,
    check_target: formState.checkTarget.trim() || null,
    check_interval: formState.checkInterval,
    check_ignore_tls: formState.checkIgnoreTls,
  };
}

export type PreparedServicePayload =
  { error: null; payload: CreateServicePayload } | { error: string; payload: null };

/**
 * Checks the form the same way the server will (required name, valid service, icon and check
 * URLs) and returns the payload with URLs normalized. Kept free of zod so the form stays light; the server
 * still validates everything it receives.
 */
export function prepareServicePayload(formState: ServiceDialogFormState): PreparedServicePayload {
  const payload = buildServicePayload(formState);
  if (!payload.name) {
    return { error: "name is required", payload: null };
  }

  const url = normalizeServiceUrl(payload.url);
  if (!url) {
    return { error: "service url must be a valid URL", payload: null };
  }

  const externalUrl = payload.external_url ? normalizeServiceUrl(payload.external_url) : null;
  if (payload.external_url && !externalUrl) {
    return { error: "external url must be a valid URL", payload: null };
  }

  const links = normalizeServiceLinks(payload.links ?? []);
  if (!links.ok) {
    return { error: links.error, payload: null };
  }

  const tags = normalizeTags(payload.tags ?? []);
  if (!tags.ok) {
    return { error: tags.error, payload: null };
  }

  const iconUrl = payload.icon_url ? normalizeIconUrl(payload.icon_url) : null;
  if (payload.icon_url && !iconUrl) {
    return { error: "icon url must be a valid http(s) URL", payload: null };
  }

  const checkTarget = normalizeCheckTarget(formState.checkMethod, payload.check_target);
  if (!checkTarget.ok) {
    return { error: checkTarget.error, payload: null };
  }

  return {
    error: null,
    payload: {
      ...payload,
      url,
      external_url: externalUrl,
      links: links.value,
      tags: tags.value,
      icon_url: iconUrl,
      check_target: checkTarget.value,
    },
  };
}

export function isServiceDialogSubmittable(formState: ServiceDialogFormState): boolean {
  if (!formState.name.trim() || !formState.url.trim()) {
    return false;
  }

  if (formState.selectedCategory !== NEW_CATEGORY_VALUE) {
    return true;
  }

  return resolveSelectedCategory(formState) !== null;
}

type CheckField =
  "checkEnabled" | "checkIgnoreTls" | "checkInterval" | "checkMethod" | "checkTarget";

export function useServiceDialogState({
  categoryOptions,
  defaultCategory,
  service,
}: UseServiceDialogStateOptions) {
  const [iconFile, setIconFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldIdPrefix = useId();
  const [formState, setFormState] = useState<ServiceDialogFormState>(() =>
    createInitialFormState(service, categoryOptions, defaultCategory)
  );

  const handleIconChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIconFile(file);
    setFormState((current) => ({
      ...current,
      iconPreview: null,
      iconUrl: "",
      removeIcon: false,
    }));

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setFormState((current) => ({
        ...current,
        iconPreview: typeof result === "string" ? result : null,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleIconUrlChange = (value: string) => {
    setIconFile(null);
    setFormState((current) => {
      const trimmedValue = value.trim();

      return {
        ...current,
        iconPreview: trimmedValue || getServiceIconPreview(service),
        iconUrl: value,
        removeIcon: false,
      };
    });
  };

  const handleRemoveIcon = () => {
    setIconFile(null);
    setFormState((current) => ({
      ...current,
      iconPreview: null,
      iconUrl: "",
      removeIcon: true,
    }));
    resetFileInput(fileInputRef);
  };

  // Only worth showing while the saved, downloaded icon is still the one that will be kept.
  const storedIconSourceUrl =
    service?.icon_source_url && !iconFile && !formState.iconUrl.trim() && !formState.removeIcon
      ? service.icon_source_url
      : null;

  const fieldIds: ServiceDialogFieldIds = {
    categoryInputId: `${fieldIdPrefix}-category`,
    checkEnabledInputId: `${fieldIdPrefix}-check-enabled`,
    checkIgnoreTlsInputId: `${fieldIdPrefix}-check-ignore-tls`,
    checkIntervalInputId: `${fieldIdPrefix}-check-interval`,
    checkMethodInputId: `${fieldIdPrefix}-check-method`,
    checkTargetInputId: `${fieldIdPrefix}-check-target`,
    descriptionInputId: `${fieldIdPrefix}-description`,
    externalUrlInputId: `${fieldIdPrefix}-external-url`,
    iconFileInputId: `${fieldIdPrefix}-icon-file`,
    iconUrlInputId: `${fieldIdPrefix}-icon-url`,
    nameInputId: `${fieldIdPrefix}-name`,
    newCategoryInputId: `${fieldIdPrefix}-new-category`,
    newTabInputId: `${fieldIdPrefix}-new-tab`,
    tagsInputId: `${fieldIdPrefix}-tags`,
    urlInputId: `${fieldIdPrefix}-url`,
  };

  return {
    fieldIds,
    fileInputRef,
    formState,
    iconFile,
    handleIconChange,
    handleIconUrlChange,
    handleRemoveIcon,
    storedIconSourceUrl,
    setCheck: (patch: Partial<Pick<ServiceDialogFormState, CheckField>>) => {
      setFormState((current) => ({ ...current, ...patch }));
    },
    setDescription: (description: string) => {
      setFormState((current) => ({
        ...current,
        description,
      }));
    },
    setExternalUrl: (externalUrl: string) => {
      setFormState((current) => ({ ...current, externalUrl }));
    },
    setLinks: (update: (links: ServiceLinkDraft[]) => ServiceLinkDraft[]) => {
      setFormState((current) => ({ ...current, links: update(current.links) }));
    },
    setTags: (patch: Partial<Pick<ServiceDialogFormState, "tagDraft" | "tags">>) => {
      setFormState((current) => ({ ...current, ...patch }));
    },
    setName: (name: string) => {
      setFormState((current) => ({
        ...current,
        name,
      }));
    },
    /** A name found on the link's page, kept only if nothing has been typed yet. */
    suggestName: (name: string) => {
      setFormState((current) => (current.name.trim() ? current : { ...current, name }));
    },
    setNewCategory: (newCategory: string) => {
      setFormState((current) => ({
        ...current,
        newCategory,
      }));
    },
    setOpenInNewTab: (openInNewTab: boolean) => {
      setFormState((current) => ({
        ...current,
        openInNewTab,
      }));
    },
    setSelectedCategory: (selectedCategory: string) => {
      setFormState((current) => ({
        ...current,
        selectedCategory,
      }));
    },
    setUrl: (url: string) => {
      setFormState((current) => ({
        ...current,
        url,
      }));
    },
  };
}
