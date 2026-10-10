// These only matter once someone asks for them, so they load on demand. Hovering or focusing the
// button that opens one starts the download early.
export const loadSettingsDialog = () => import("@/components/settings/SettingsDialog");
export const loadEditableBoard = () => import("@/components/board/EditableBoard");

export function preloadSettingsDialog() {
  void loadSettingsDialog();
}

export function preloadEditableBoard() {
  void loadEditableBoard();
}
