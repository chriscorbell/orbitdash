import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { getIconUrl } from "@/lib/api/services";
import { hostOf, rankPaletteItems, type PaletteItem } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { buildSearchUrl, type DashboardSearchSettings } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";
import { normalizeServiceUrl } from "@shared/urls";
import { CornerDownLeft, Globe, Search } from "lucide-react";
import {
  buildPaletteActions,
  type PaletteActionWithIcon,
  type PaletteContext,
} from "@/components/palette/palette-actions";

export type { PaletteActionWithIcon, PaletteContext };

interface CommandPaletteProps {
  context: PaletteContext;
  /** Text typed before the palette opened (type-to-search). */
  initialQuery: string;
  open: boolean;
  search: DashboardSearchSettings;
  services: readonly Service[];
  onOpenChange: (open: boolean) => void;
}

const HEADINGS: Record<PaletteItem["kind"], string> = {
  action: "Actions",
  service: "Services",
  web: "Web",
};

const ENGINE_NAMES: Record<DashboardSearchSettings["engine"], string> = {
  bing: "Bing",
  brave: "Brave Search",
  custom: "the web",
  duckduckgo: "DuckDuckGo",
  google: "Google",
};

function openUrl(url: string, newTab: boolean) {
  if (newTab) window.open(url, "_blank", "noopener,noreferrer");
  else window.location.assign(url);
}

/**
 * Jump to a service, run an action, or search the web: ⌘K, `/`, or just start typing. The input
 * is a combobox over a listbox; arrow keys move, Enter opens, Ctrl or ⌘ + Enter opens a new tab.
 */
export function CommandPalette({
  context,
  initialQuery,
  open,
  search,
  services,
  onOpenChange,
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-open:duration-150 max-sm:top-3"
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          {open && (
            <PaletteBody
              context={context}
              initialQuery={initialQuery}
              search={search}
              services={services}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({
  context,
  initialQuery,
  search,
  services,
  onClose,
}: Omit<CommandPaletteProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const actions = useMemo(() => buildPaletteActions(context), [context]);
  const items = useMemo(
    () => rankPaletteItems(query, services, actions),
    [actions, query, services]
  );
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (item: PaletteItem, newTab = false) => {
    onClose();
    if (item.kind === "action") {
      item.action.run();
    } else if (item.kind === "service") {
      const url = normalizeServiceUrl(item.service.url);
      if (url) openUrl(url, newTab || item.service.open_in_new_tab);
    } else {
      openUrl(buildSearchUrl(search, item.query), true);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + items.length) % Math.max(1, items.length));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : items.length - 1);
    } else if (event.key === "Enter" && items[activeIndex]) {
      event.preventDefault();
      choose(items[activeIndex], event.metaKey || event.ctrlKey);
    }
  };

  // A heading above the first item of each kind.
  const headings = items.map((item, index) =>
    index === 0 || items[index - 1].kind !== item.kind ? HEADINGS[item.kind] : null
  );

  return (
    <>
      <div className="flex items-center gap-2.5 border-b px-4">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          // The palette exists to be typed into the moment it opens.
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-label="Search services and commands"
          placeholder="Search services, run a command, or search the web"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          Esc
        </kbd>
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Results"
        className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-1.5"
      >
        {items.map((item, index) => {
          const heading = headings[index];
          const selected = index === activeIndex;
          return (
            <li key={item.id} role="presentation">
              {heading && (
                <p
                  role="presentation"
                  className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {heading}
                </p>
              )}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                data-index={index}
                onPointerMove={() => setActive(index)}
                onClick={(event) => choose(item, event.metaKey || event.ctrlKey)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                  selected ? "bg-accent text-accent-foreground" : "text-foreground"
                )}
              >
                <PaletteItemContent item={item} search={search} />
                {selected && (
                  <CornerDownLeft
                    aria-hidden="true"
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PaletteItemContent({
  item,
  search,
}: {
  item: PaletteItem;
  search: DashboardSearchSettings;
}) {
  if (item.kind === "service") {
    const { service } = item;
    return (
      <>
        <ServiceIcon
          className="h-6 w-6"
          name=""
          src={service.icon ? getIconUrl(service.icon, service.updated_at) : null}
        />
        <span className="min-w-0 truncate font-medium">{service.name}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {[service.category, hostOf(service.url)].filter(Boolean).join(" · ")}
        </span>
      </>
    );
  }
  if (item.kind === "action") {
    const Icon = (item.action as PaletteActionWithIcon).icon ?? Search;
    return (
      <>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{item.action.label}</span>
      </>
    );
  }
  return (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Globe aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate">
        Search {ENGINE_NAMES[search.engine]} for <span className="font-medium">“{item.query}”</span>
      </span>
    </>
  );
}
