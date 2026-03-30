import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, FolderKanban, Globe, Plus, Search, Sparkles } from "lucide-react";

interface ServicesEmptyStateProps {
  mode: "empty" | "search";
  search?: string;
  onAddService: () => void;
  onClearSearch?: () => void;
}

const suggestedCategories = ["Infrastructure", "Media", "Productivity", "Development"];

const starterIdeas = [
  {
    title: "Infrastructure",
    description: "Proxmox, DNS, routers, file browsers, monitoring tools",
    icon: FolderKanban,
  },
  {
    title: "Media",
    description: "Jellyfin, Immich, Navidrome, ErsatzTV and streaming apps",
    icon: Globe,
  },
  {
    title: "Private web apps",
    description: "Anything you self-host and want one clean place to launch",
    icon: Sparkles,
  },
];

export function ServicesEmptyState({
  mode,
  search,
  onAddService,
  onClearSearch,
}: ServicesEmptyStateProps) {
  if (mode === "search") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center sm:py-12">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Search className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">No services match that search</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Try a different name, category, or URL fragment
              {search?.trim() ? ` for “${search.trim()}”.` : "."}
            </p>
          </div>
          {onClearSearch && (
            <Button variant="outline" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              First steps
            </Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg">Build your dashboard one service at a time</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              orbitdash works best when it becomes the front door to your homelab — add the
              apps, admin panels, and tools you reach for every day.
            </CardDescription>
          </div>
        </div>
        <Button size="lg" onClick={onAddService} className="shrink-0">
          <Plus className="h-4 w-4" />
          Add your first service
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {starterIdeas.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-sm"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Suggested starting categories</p>
            <p className="text-sm text-muted-foreground">
              Keep things simple at first — you can organize and reorder everything later.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedCategories.map((category) => (
              <Badge key={category} variant="outline">
                {category}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Tip: start with the apps you open most often, then fill in the rest as you go.
          </p>
          <Button variant="ghost" size="sm" onClick={onAddService} className="justify-start sm:justify-center">
            Open add service dialog
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
