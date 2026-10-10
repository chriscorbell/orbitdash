import { useEffect } from "react";
import { LOGO_CIRCLE, LOGO_PATHS } from "@/lib/logo-shapes";
import type { AccentPreset, DashboardAppearanceSettings } from "@shared/dashboard-settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";
export const DEFAULT_TITLE = "orbitdash";
const CUSTOM_CSS_ID = "orbitdash-custom-css";

/** Mid-tone accent colors that read on both light and dark browser tabs. */
const FAVICON_COLORS: Record<AccentPreset, string> = {
  amber: "#e99b2a",
  graphite: "#82878c",
  ice: "#49a9df",
  mint: "#3fbe90",
  rose: "#e9687c",
  violet: "#9782e9",
};

/** The orbitdash mark in the accent color, as a data URL for the favicon. */
export function faviconDataUrl(accent: AccentPreset): string {
  const { cx, cy, r } = LOGO_CIRCLE;
  const shapes =
    `<circle cx="${cx}" cy="${cy}" r="${r}"/>` + LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.1 0 18.1 20" fill="${FAVICON_COLORS[accent]}">${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches === true;
}

type ThemeAppearance = Pick<DashboardAppearanceSettings, "accent" | "theme">;

/** Puts the theme and accent on <html>, where the CSS tokens read them. */
export function applyAppearance(appearance: ThemeAppearance, root = document.documentElement) {
  const dark = appearance.theme === "dark" || (appearance.theme === "system" && prefersDark());
  root.classList.toggle("dark", dark);
  root.dataset.accent = appearance.accent;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content =
      getComputedStyle(root).getPropertyValue("--background").trim() || themeColor.content;
  }
}

/** The tab title, an accent-colored favicon, and any custom CSS (added after the app's styles). */
export function applyDocumentAppearance({
  accent,
  customCss,
  title,
}: Pick<DashboardAppearanceSettings, "accent" | "customCss" | "title">) {
  document.title = title.trim() || DEFAULT_TITLE;

  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/svg+xml";
  icon.href = faviconDataUrl(accent);

  let style = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null;
  if (!customCss.trim()) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
  }
  style.textContent = customCss;
  // Last in <head>, so it wins over the app's own styles at equal specificity.
  document.head.appendChild(style);
}

/** Keeps <html> in step with settings, and with the OS when the theme follows the system. */
export function useAppliedAppearance(appearance: DashboardAppearanceSettings) {
  const { accent, customCss, theme, title } = appearance;

  useEffect(() => {
    applyDocumentAppearance({ accent, customCss, title });
  }, [accent, customCss, title]);

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
