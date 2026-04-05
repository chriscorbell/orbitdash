export const CATEGORY_ORDER_SETTING_KEY = "services.categoryOrder";
export const UNCATEGORIZED_CATEGORY = "Uncategorized";

export function sanitizeCategoryOrder(order: readonly string[]): string[] {
  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of order) {
    const value = rawValue.trim();
    if (!value || value === UNCATEGORIZED_CATEGORY || seen.has(value)) {
      continue;
    }

    seen.add(value);
    sanitized.push(value);
  }

  return sanitized;
}

export function mergeCategoryOrder(
  categories: readonly string[],
  savedOrder: readonly string[]
): string[] {
  const normalizedCategories = sanitizeCategoryOrder(categories);
  const categorySet = new Set(normalizedCategories);
  const orderedCategories = sanitizeCategoryOrder(savedOrder).filter((category) =>
    categorySet.has(category)
  );
  const seen = new Set(orderedCategories);
  const unorderedCategories = normalizedCategories
    .filter((category) => !seen.has(category))
    .sort((left, right) => left.localeCompare(right));

  return [...orderedCategories, ...unorderedCategories];
}
