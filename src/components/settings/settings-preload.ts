// The sortable category list pulls in dnd-kit, so it loads on demand. Hovering or focusing the
// settings button starts the download before the dialog opens.
export const loadCategoryOrderList = () => import("@/components/services/CategoryOrderList");

export function preloadSettingsDialog() {
  void loadCategoryOrderList();
}
