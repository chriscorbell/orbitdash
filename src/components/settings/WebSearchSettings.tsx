import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isSearchUrlTemplate,
  SEARCH_ENGINE_OPTIONS,
  SEARCH_URL_MAX_LENGTH,
  type DashboardSearchSettings,
  type SearchEngine,
} from "@shared/dashboard-settings";

const ENGINE_LABELS: Record<SearchEngine, string> = {
  bing: "Bing",
  brave: "Brave Search",
  custom: "Custom URL",
  duckduckgo: "DuckDuckGo",
  google: "Google",
};

interface WebSearchSettingsProps {
  search: DashboardSearchSettings;
  onChange: (search: Partial<DashboardSearchSettings>) => void;
}

/** Where the command palette searches when nothing on the dashboard matches. */
export function WebSearchSettings({ search, onChange }: WebSearchSettingsProps) {
  const [draft, setDraft] = useState(search.customUrl);
  const valid = draft.trim() === "" || isSearchUrlTemplate(draft.trim());

  const commitUrl = () => {
    const next = draft.trim();
    if (isSearchUrlTemplate(next) && next !== search.customUrl) onChange({ customUrl: next });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label htmlFor="search-engine">Web search</Label>
        <p className="text-muted-foreground text-sm">
          Used by the command palette when nothing matches
        </p>
      </div>
      <Select
        value={search.engine}
        onValueChange={(engine) => onChange({ engine: engine as SearchEngine })}
      >
        <SelectTrigger id="search-engine" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SEARCH_ENGINE_OPTIONS.map((engine) => (
            <SelectItem key={engine} value={engine}>
              {ENGINE_LABELS[engine]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {search.engine === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor="search-url" className="text-xs text-muted-foreground">
            Search URL, with %s where the query goes
          </Label>
          <Input
            id="search-url"
            value={draft}
            maxLength={SEARCH_URL_MAX_LENGTH}
            placeholder="https://searx.example.com/search?q=%s"
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : "search-url-error"}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitUrl}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitUrl();
              }
            }}
          />
          {!valid && (
            <p id="search-url-error" className="text-sm text-destructive">
              Use an http or https address that contains %s.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
