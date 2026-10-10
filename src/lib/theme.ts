import { useEffect } from "react";
import type { DashboardAppearanceSettings } from "@shared/dashboard-settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches === true;
}

/** Puts the theme and accent on <html>, where the CSS tokens read them. */
export function applyAppearance(
  appearance: DashboardAppearanceSettings,
  root = document.documentElement
) {
  const dark = appearance.theme === "dark" || (appearance.theme === "system" && prefersDark());
  root.classList.toggle("dark", dark);
  root.dataset.accent = appearance.accent;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content =
      getComputedStyle(root).getPropertyValue("--background").trim() || themeColor.content;
  }
}

/** Keeps <html> in step with settings, and with the OS when the theme follows the system. */
export function useAppliedAppearance(appearance: DashboardAppearanceSettings) {
  const { accent, theme } = appearance;

  useEffect(() => {
    applyAppearance({ accent, theme });
    if (theme !== "system" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyAppearance({ accent, theme });
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [accent, theme]);
}
