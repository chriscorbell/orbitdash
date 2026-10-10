import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { searchIconLibrary } from "@/lib/api/icon-library";
import { cn } from "@/lib/utils";
import type { IconLibraryEntry } from "@shared/types";
import { LoaderCircle, Search } from "lucide-react";

const SOURCE_NAMES: Record<IconLibraryEntry["source"], string> = {
  "dashboard-icons": "dashboard-icons",
  selfhst: "selfh.st",
};

function useIconLibrary(query: string, limit: number) {
  const settled = useDebouncedValue(query.trim(), 300);
  return useQuery({
    queryKey: ["icon-library", settled, limit],
    queryFn: () => searchIconLibrary(settled, limit),
    enabled: settled.length >= 2,
    staleTime: 60 * 60 * 1000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

interface IconChoiceProps {
  entry: IconLibraryEntry;
  selected: boolean;
  showName?: boolean;
  onSelect: (url: string) => void;
}

function IconChoice({ entry, selected, showName = false, onSelect }: IconChoiceProps) {
  return (
    <button
      type="button"
      aria-label={`Use the ${entry.name} icon from ${SOURCE_NAMES[entry.source]}`}
      aria-pressed={selected}
      title={`${entry.name} · ${SOURCE_NAMES[entry.source]}`}
      onClick={() => onSelect(entry.url)}
      className={cn(
        "group flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1.5 transition-[background-color,border-color,box-shadow] hover:border-brand/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-brand bg-brand-soft" : "border-border"
      )}
    >
      <img
        src={entry.url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-8 w-8 object-contain transition-transform duration-150 group-hover:scale-105"
      />
      {showName && (
        <span className="w-full truncate text-center text-[10px] text-muted-foreground">
          {entry.name}
        </span>
      )}
    </button>
  );
}

const CREDIT = (
  <p className="text-[11px] text-muted-foreground">
    Icons from{" "}
    <a
      href="https://github.com/homarr-labs/dashboard-icons"
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      dashboard-icons
    </a>{" "}
    and{" "}
    <a
      href="https://selfh.st/icons/"
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      selfh.st/icons
    </a>
    .
  </p>
);

/** A few icons that match the service's name, offered before the user goes looking. */
export function IconSuggestions({
  name,
  selectedUrl,
  onSelect,
}: {
  name: string;
  selectedUrl: string;
  onSelect: (url: string) => void;
}) {
  const { data } = useIconLibrary(name, 6);
  const entries = data?.entries ?? [];
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5 animate-in fade-in-0 duration-200">
      <p className="text-xs text-muted-foreground">Suggested for “{name.trim()}”</p>
      <div className="grid grid-cols-6 gap-1.5">
        {entries.map((entry) => (
          <IconChoice
            key={entry.id}
            entry={entry}
            selected={entry.url === selectedUrl}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/** Search both icon libraries and pick one; the server downloads it when the service is saved. */
export function IconLibraryPanel({
  initialQuery,
  selectedUrl,
  onSelect,
}: {
  initialQuery: string;
  selectedUrl: string;
  onSelect: (url: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const { data, error, isFetching } = useIconLibrary(query, 48);
  const entries = data?.entries ?? [];
  const searching = query.trim().length >= 2;

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          // The panel opens to search, so it takes focus.
          autoFocus
          type="search"
          aria-label="Search the icon library"
          placeholder="Search icons, e.g. plex"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-8 font-normal [&::-webkit-search-cancel-button]:hidden"
        />
        {isFetching && (
          <LoaderCircle
            aria-hidden="true"
            className="absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          The icon library is unavailable right now. Upload an icon or paste a URL instead.
        </p>
      ) : !searching ? (
        <p className="text-sm text-muted-foreground">Type at least two letters.</p>
      ) : entries.length === 0 && !isFetching ? (
        <p className="text-sm text-muted-foreground">No icons match that.</p>
      ) : (
        <div
          role="group"
          aria-label="Icon library results"
          className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-6"
        >
          {entries.map((entry) => (
            <IconChoice
              key={entry.id}
              entry={entry}
              selected={entry.url === selectedUrl}
              showName
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      {CREDIT}
    </div>
  );
}
