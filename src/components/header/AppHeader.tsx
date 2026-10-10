import type { ReactNode } from "react";
import {
  Activity,
  Check,
  FolderPlus,
  LayoutGrid,
  PencilRuler,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { HeaderStatus } from "@/components/header/HeaderStatus";
import { Logo } from "@/components/common/Logo";
import {
  preloadEditableBoard,
  preloadSettingsDialog,
  preloadStatsPage,
} from "@/components/settings/settings-preload";
import { Button } from "@/components/ui/button";
import { handleLinkClick } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { ClockFormat } from "@shared/dashboard-settings";

export type AppPage = "services" | "stats";

interface AppHeaderProps {
  /** Edit mode swaps the search trigger and status for the editing controls. */
  editing: boolean;
  page?: AppPage;
  /** Shows the Services and Stats tabs; off when the Stats page is turned off. */
  showStatsPage?: boolean;
  /** The dashboard's name from settings; empty shows "orbitdash". */
  title?: string;
  /** Whether the board is shown, so there is something to edit. */
  canEditLayout: boolean;
  onAddService: () => void;
  onDoneEditing: () => void;
  onEditLayout: () => void;
  onNewCategory: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  /** Starts loading the palette before it is needed. */
  onPreloadPalette?: () => void;
  clockFormat?: ClockFormat;
  /** Compact widgets shown next to the host status. */
  widgets?: ReactNode;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Sticky top bar: brand, page tabs, palette trigger (⌘K), host status, add, edit and settings. */
const PAGES: Array<{ page: AppPage; path: string; label: string; Icon: typeof Activity }> = [
  { page: "services", path: "/", label: "Services", Icon: LayoutGrid },
  { page: "stats", path: "/stats", label: "Stats", Icon: Activity },
];

export function AppHeader({
  editing,
  page = "services",
  showStatsPage = false,
  title = "",
  canEditLayout,
  onAddService,
  onDoneEditing,
  onEditLayout,
  onNewCategory,
  onOpenPalette,
  onOpenSettings,
  onPreloadPalette,
  clockFormat,
  widgets,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md"
          onClick={(event) => handleLinkClick(event, "/")}
        >
          <Logo className="h-6 w-6 text-foreground" />
          <span className="hidden max-w-48 truncate text-base font-semibold tracking-tight lg:inline">
            {title.trim() || "orbitdash"}
          </span>
        </a>

        {showStatsPage && !editing && (
          <nav
            aria-label="Pages"
            className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5"
          >
            {PAGES.map(({ page: target, path, label, Icon }) => {
              const current = target === page;
              return (
                <a
                  key={target}
                  href={path}
                  aria-current={current ? "page" : undefined}
                  onClick={(event) => handleLinkClick(event, path)}
                  onPointerEnter={target === "stats" ? preloadStatsPage : undefined}
                  onFocus={target === "stats" ? preloadStatsPage : undefined}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-9 sm:px-2.5",
                    current
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </a>
              );
            })}
          </nav>
        )}

        {editing ? (
          <>
            <div
              key="editing"
              className="mx-auto flex min-w-0 animate-in items-baseline gap-2 fade-in-0 duration-200"
            >
              <p className="text-sm font-semibold">Editing layout</p>
              <p className="hidden truncate text-sm text-muted-foreground md:block">
                Drag cards and categories. Changes save as you go.
              </p>
            </div>
            <div className="flex shrink-0 animate-in items-center gap-1.5 fade-in-0 duration-200">
              <Button type="button" variant="outline" size="sm" onClick={onNewCategory}>
                <FolderPlus />
                <span className="sr-only sm:not-sr-only">New category</span>
              </Button>
              <Button type="button" size="sm" onClick={onDoneEditing}>
                <Check />
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Search services and commands"
              aria-keyshortcuts={isMac ? "Meta+K /" : "Control+K /"}
              onClick={onOpenPalette}
              onFocus={onPreloadPalette}
              onPointerEnter={onPreloadPalette}
              className="relative mx-auto flex h-9 w-full max-w-md min-w-0 items-center gap-2 rounded-lg border border-input bg-card/60 pr-2.5 pl-3 text-left text-sm text-muted-foreground shadow-xs transition-[border-color,box-shadow,color] hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
              <kbd className="hidden rounded border px-1.5 font-mono text-[10px] sm:inline-block">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>

            <HeaderStatus clockFormat={clockFormat}>{widgets}</HeaderStatus>

            <div className="flex shrink-0 items-center gap-1">
              {page === "services" && (
                <Button
                  type="button"
                  size="icon-sm"
                  className="pointer-coarse:size-9"
                  aria-label="Add service"
                  onClick={onAddService}
                >
                  <Plus />
                </Button>
              )}
              {canEditLayout && page === "services" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:size-9"
                  aria-label="Edit layout"
                  onClick={onEditLayout}
                  onFocus={preloadEditableBoard}
                  onPointerEnter={preloadEditableBoard}
                >
                  <PencilRuler />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="pointer-coarse:size-9"
                aria-label="Open settings"
                onClick={onOpenSettings}
                onFocus={preloadSettingsDialog}
                onPointerEnter={preloadSettingsDialog}
              >
                <Settings />
              </Button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
