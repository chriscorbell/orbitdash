// These only matter once someone asks for them, so they load on demand. Hovering or focusing the
// button that opens one starts the download early.
export const loadSettingsDialog = () => import("@/components/settings/SettingsDialog");
export const loadEditableBoard = () => import("@/components/board/EditableBoard");
export const loadStatsPage = () => import("@/components/stats-page/StatsPage");
export const loadCommandPalette = () => import("@/components/palette/CommandPalette");
export const loadWidgets = () => import("@/components/widgets/Widgets");

export function preloadSettingsDialog() {
  void loadSettingsDialog();
}

export function preloadEditableBoard() {
  void loadEditableBoard();
}

export function preloadStatsPage() {
  void loadStatsPage();
}

export function preloadCommandPalette() {
  void loadCommandPalette();
}

export const loadImportDialog = () => import("@/components/settings/ImportDialog");
