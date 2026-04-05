import { useId, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { getIconUrl } from "@/lib/api/services";
import type { CreateServicePayload, Service } from "@shared/types";

export const NEW_CATEGORY_VALUE = "__new__";
export const NONE_CATEGORY_VALUE = "__none__";

export interface ServiceDialogFormState {
  description: string;
  iconPreview: string | null;
  iconUrl: string;
  name: string;
  newCategory: string;
  openInNewTab: boolean;
  removeIcon: boolean;
  selectedCategory: string;
  url: string;
}

interface ServiceDialogFieldIds {
  categoryInputId: string;
  descriptionInputId: string;
  iconFileInputId: string;
  iconUrlInputId: string;
  nameInputId: string;
  newCategoryInputId: string;
  newTabInputId: string;
  urlInputId: string;
}

interface UseServiceDialogStateOptions {
  categoryOptions: string[];
  service?: Service | null;
}

function getServiceIconPreview(service?: Service | null) {
  return service?.icon ? getIconUrl(service.icon, service.updated_at) : null;
}

function resolveInitialCategoryState(
  service: Service | null | undefined,
  categoryOptions: string[]
) {
  const initialCategory = service?.category?.trim() ?? "";

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
  categoryOptions: string[]
): ServiceDialogFormState {
  const categoryState = resolveInitialCategoryState(service, categoryOptions);

  return {
    description: service?.description ?? "",
    iconPreview: getServiceIconPreview(service),
    iconUrl: "",
    name: service?.name ?? "",
    newCategory: categoryState.newCategory,
    openInNewTab: service?.open_in_new_tab ?? true,
    removeIcon: false,
    selectedCategory: categoryState.selectedCategory,
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
    description: formState.description.trim() || null,
    icon_url: formState.iconUrl.trim() || null,
    category: resolveSelectedCategory(formState),
    open_in_new_tab: formState.openInNewTab,
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

export function useServiceDialogState({ categoryOptions, service }: UseServiceDialogStateOptions) {
  const [iconFile, setIconFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldIdPrefix = useId();
  const [formState, setFormState] = useState<ServiceDialogFormState>(() =>
    createInitialFormState(service, categoryOptions)
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

  const fieldIds: ServiceDialogFieldIds = {
    categoryInputId: `${fieldIdPrefix}-category`,
    descriptionInputId: `${fieldIdPrefix}-description`,
    iconFileInputId: `${fieldIdPrefix}-icon-file`,
    iconUrlInputId: `${fieldIdPrefix}-icon-url`,
    nameInputId: `${fieldIdPrefix}-name`,
    newCategoryInputId: `${fieldIdPrefix}-new-category`,
    newTabInputId: `${fieldIdPrefix}-new-tab`,
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
    setDescription: (description: string) => {
      setFormState((current) => ({
        ...current,
        description,
      }));
    },
    setName: (name: string) => {
      setFormState((current) => ({
        ...current,
        name,
      }));
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
