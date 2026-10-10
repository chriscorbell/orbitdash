import { useEffect, useRef } from "react";
import { Check, FolderPlus, PencilRuler, Plus, Search, Settings, X } from "lucide-react";
import { HeaderStatus } from "@/components/header/HeaderStatus";
import { Logo } from "@/components/common/Logo";
import {
  preloadEditableBoard,
  preloadSettingsDialog,
} from "@/components/settings/settings-preload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  /** Edit mode swaps search and status for the editing controls. */
  editing: boolean;
  search: string;
  /** The dashboard's name from settings; empty shows "orbitdash". */
  title?: string;
  /** Whether the board is shown, so there is something to edit. */
  canEditLayout: boolean;
  onAddService: () => void;
  onDoneEditing: () => void;
  onEditLayout: () => void;
  onNewCategory: () => void;
  onOpenSettings: () => void;
  onSearchChange: (value: string) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Sticky top bar: brand, search (⌘K or /), host status and clock, add, edit and settings. */
export function AppHeader({
  editing,
  search,
  title = "",
  canEditLayout,
  onAddService,
  onDoneEditing,
  onEditLayout,
  onNewCategory,
  onOpenSettings,
  onSearchChange,
}: AppHeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !isTypingTarget(event.target);
      if (commandK || slash) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2.5 rounded-md">
          <Logo className="h-6 w-6 text-foreground" />
          <span className="hidden max-w-48 truncate text-base font-semibold tracking-tight sm:inline">
            {title.trim() || "orbitdash"}
          </span>
        </a>

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
            <div className="relative mx-auto w-full max-w-md">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={searchRef}
                type="search"
                name="serviceSearch"
                aria-label="Search services"
                placeholder="Search services"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onSearchChange("");
                    event.currentTarget.blur();
                  }
                }}
                className={cn(
                  "h-9 w-full rounded-lg border border-input bg-card/60 pr-16 pl-9 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
                )}
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onSearchChange("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
                  {isMac ? "⌘K" : "Ctrl K"}
                </kbd>
              )}
            </div>

            <HeaderStatus />

            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" size="icon-sm" aria-label="Add service" onClick={onAddService}>
                <Plus />
              </Button>
              {canEditLayout && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
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
