import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Container, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ServiceIcon } from "@/components/services/ServiceIcon";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import { subscribeContainers } from "@/lib/api/docker";
import { dismissSuggestion, fetchDiscovery, restoreDismissed } from "@/lib/api/discovery";
import type { CreateServicePayload, DiscoverySuggestion } from "@shared/types";

const DISCOVERY_KEY = ["discovery"] as const;

interface DiscoveryBannerProps {
  categories: readonly string[];
  onCreate: (payload: CreateServicePayload) => Promise<unknown>;
}

/** Where a suggestion links: its label URL, or its port on the host the dashboard was opened on. */
function suggestionUrl(suggestion: DiscoverySuggestion): string {
  if (suggestion.url) return suggestion.url;
  const host = window.location.hostname.includes(":")
    ? `[${window.location.hostname}]`
    : window.location.hostname;
  return `http://${host}:${suggestion.port}/`;
}

function useDiscovery() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: DISCOVERY_KEY, queryFn: fetchDiscovery, staleTime: 30_000 });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: DISCOVERY_KEY });
  // New services and dismissals elsewhere, and containers coming and going, change the list.
  useConfigChanges(["layout", "settings"], refresh);
  useEffect(
    () =>
      subscribeContainers(() => void queryClient.invalidateQueries({ queryKey: DISCOVERY_KEY })),
    [queryClient]
  );
  return { query, refresh };
}

/** A quiet line above the board when running containers aren't on the dashboard yet. */
export function DiscoveryBanner({ categories, onCreate }: DiscoveryBannerProps) {
  const { query, refresh } = useDiscovery();
  const [open, setOpen] = useState(false);
  const suggestions = query.data?.suggestions ?? [];
  if (suggestions.length === 0 && !open) return null;

  const count = suggestions.length;
  return (
    <>
      {count > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed px-3.5 py-2.5 text-sm animate-in fade-in-0 duration-300">
          <Container aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-muted-foreground">
            {count === 1
              ? `${suggestions[0].name} is running but isn't on the dashboard yet`
              : `${count} running containers aren't on the dashboard yet`}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Review
          </Button>
        </div>
      )}
      <DiscoveryDialog
        open={open}
        onOpenChange={setOpen}
        suggestions={suggestions}
        dismissed={query.data?.dismissed ?? 0}
        categories={categories}
        onCreate={async (payload) => {
          await onCreate(payload);
          refresh();
        }}
        onChanged={refresh}
      />
    </>
  );
}

interface DiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: DiscoverySuggestion[];
  dismissed: number;
  categories: readonly string[];
  onCreate: (payload: CreateServicePayload) => Promise<void>;
  onChanged: () => void;
}

function DiscoveryDialog({
  open,
  onOpenChange,
  suggestions,
  dismissed,
  categories,
  onCreate,
  onChanged,
}: DiscoveryDialogProps) {
  const dismiss = useMutation({ mutationFn: dismissSuggestion, onSuccess: onChanged });
  const restore = useMutation({ mutationFn: restoreDismissed, onSuccess: onChanged });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        // The names are already right most of the time; don't open with one selected.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Running containers</DialogTitle>
          <DialogDescription>
            Add the ones you want on the dashboard. Labels like <code>orbitdash.name</code> and
            Homepage's <code>homepage.href</code> fill in the details.
          </DialogDescription>
        </DialogHeader>
        <datalist id="discovery-categories">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everything running is on the dashboard.</p>
        ) : (
          <ul className="divide-y divide-border">
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.key}
                suggestion={suggestion}
                dismissing={dismiss.isPending && dismiss.variables === suggestion.key}
                onAdd={onCreate}
                onDismiss={() => dismiss.mutate(suggestion.key)}
              />
            ))}
          </ul>
        )}
        {(dismiss.error || restore.error) && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {(dismiss.error ?? restore.error)?.message}
          </p>
        )}
        {dismissed > 0 && (
          <button
            type="button"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Show {dismissed === 1 ? "1 dismissed container" : `${dismissed} dismissed containers`}{" "}
            again
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuggestionRow({
  suggestion,
  dismissing,
  onAdd,
  onDismiss,
}: {
  suggestion: DiscoverySuggestion;
  dismissing: boolean;
  onAdd: (payload: CreateServicePayload) => Promise<void>;
  onDismiss: () => void;
}) {
  const [name, setName] = useState(suggestion.name);
  const [category, setCategory] = useState(suggestion.category ?? "");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = suggestionUrl(suggestion);

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      await onAdd({
        name: name.trim() || suggestion.name,
        url,
        description: suggestion.description,
        icon_url: suggestion.iconUrl,
        category: category.trim() || null,
        open_in_new_tab: true,
      });
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Couldn't add it");
      setAdding(false);
    }
  };

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <ServiceIcon className="h-8 w-8" name="" src={suggestion.iconUrl} />
        <div className="min-w-0 flex-1">
          <Input
            aria-label={`Name for ${suggestion.key}`}
            value={name}
            maxLength={100}
            disabled={adding}
            onChange={(event) => setName(event.target.value)}
            className="h-8 font-medium"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={adding || dismissing}
          onClick={() => void add()}
          aria-label={`Add ${name.trim() || suggestion.name}`}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={adding || dismissing}
          onClick={onDismiss}
          aria-label={`Dismiss ${suggestion.key}`}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-11">
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={url}
        >
          {url}
        </span>
        <Input
          aria-label={`Category for ${suggestion.key}`}
          list="discovery-categories"
          placeholder="Uncategorized"
          value={category}
          maxLength={100}
          disabled={adding}
          onChange={(event) => setCategory(event.target.value)}
          className="h-8 w-36 text-xs"
        />
      </div>
      {error && <p className="pl-11 text-xs text-destructive">{error}</p>}
    </li>
  );
}
