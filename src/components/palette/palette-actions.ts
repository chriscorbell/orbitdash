import {
  Activity,
  LayoutGrid,
  Monitor,
  Moon,
  PencilRuler,
  Plus,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { PaletteAction } from "@/lib/palette";
import type { ThemePreference } from "@shared/dashboard-settings";

export interface PaletteActionWithIcon extends PaletteAction {
  icon: LucideIcon;
}

/** What the palette's actions depend on; the actions themselves load with the palette. */
export interface PaletteContext {
  /** Guests only get navigation; everything that changes the dashboard needs a sign-in. */
  canEdit: boolean;
  page: "services" | "stats" | "settings";
  showServices: boolean;
  showStatsPage: boolean;
  theme: ThemePreference;
  onAddService: () => void;
  onEditLayout: () => void;
  onNavigate: (path: string) => void;
  onOpenSettings: () => void;
  onThemeChange: (theme: ThemePreference) => void;
}

const THEMES = [
  ["dark", "Use dark theme", Moon],
  ["light", "Use light theme", Sun],
  ["system", "Use system theme", Monitor],
] as const;

export function buildPaletteActions(context: PaletteContext): PaletteActionWithIcon[] {
  const actions: PaletteActionWithIcon[] = [];
  if (context.canEdit) {
    actions.push({
      id: "add-service",
      label: "Add service",
      keywords: "new create link app",
      icon: Plus,
      run: context.onAddService,
    });
    if (context.showServices) {
      actions.push({
        id: "edit-layout",
        label: "Edit layout",
        keywords: "arrange reorder drag categories move",
        icon: PencilRuler,
        run: context.onEditLayout,
      });
    }
  }
  if (context.page !== "services") {
    actions.push({
      id: "go-services",
      label: "Go to Services",
      keywords: "home dashboard links",
      icon: LayoutGrid,
      run: () => context.onNavigate("/"),
    });
  }
  if (context.showStatsPage && context.page !== "stats") {
    actions.push({
      id: "go-stats",
      label: "Go to Stats",
      keywords: "metrics charts cpu memory disk network",
      icon: Activity,
      run: () => context.onNavigate("/stats"),
    });
  }
  if (context.canEdit) {
    if (context.page !== "settings") {
      actions.push({
        id: "open-settings",
        label: "Open settings",
        keywords: "preferences options configure",
        icon: Settings,
        run: context.onOpenSettings,
      });
    }
    for (const [theme, label, icon] of THEMES) {
      if (theme === context.theme) continue;
      actions.push({
        id: `theme-${theme}`,
        label,
        keywords: "appearance mode color",
        icon,
        run: () => context.onThemeChange(theme),
      });
    }
  }
  return actions;
}
