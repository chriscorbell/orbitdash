import { useCallback } from "react";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";

export interface CategoryGroupKey {
  key: string;
  name: string;
}

const STORAGE_KEY = "orbitdash.collapsedCategoryIds";
const LEGACY_STORAGE_KEY = "orbitdash.collapsedCategories";

/** Older versions stored collapsed category names; translate them to ids once and drop the key. */
function readLegacyCollapsed(groups: readonly CategoryGroupKey[]): string[] {
  try {
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) {
      return [];
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

    const names: unknown = JSON.parse(legacy);
    if (!Array.isArray(names)) {
      return [];
    }
    return groups.filter((group) => names.includes(group.name)).map((group) => group.key);
  } catch {
    return [];
  }
}

/** Collapsed categories for this browser, keyed by category id so renames keep the state. */
export function useCollapsedCategories(groups: readonly CategoryGroupKey[]) {
  const [collapsed, setCollapsed] = useLocalStorageState<string[]>(STORAGE_KEY, () =>
    readLegacyCollapsed(groups)
  );

  const toggle = useCallback(
    (key: string) => {
      setCollapsed((current) =>
        current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
      );
    },
    [setCollapsed]
  );

  return { collapsed, toggle };
}
