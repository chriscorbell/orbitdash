// The settings dialog only matters once someone opens it, and its sortable category list pulls in
// dnd-kit, so both load on demand. Hovering or focusing the settings button starts the download.
export const loadSettingsDialog = () => import("@/components/settings/SettingsDialog");
export const loadCategoryOrderList = () => import("@/components/services/CategoryOrderList");

export function preloadSettingsDialog() {
  void loadSettingsDialog();
  void loadCategoryOrderList();
}
