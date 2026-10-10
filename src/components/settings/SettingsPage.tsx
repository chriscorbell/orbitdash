import { lazy, Suspense, type ComponentType } from "react";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Container,
  Database,
  LayoutGrid,
  Palette,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SCOPED_SECTIONS,
  SETTINGS_SECTIONS,
  type SettingsProps,
  type SettingsSectionId,
} from "@/components/settings/settings-sections";
import { handleLinkClick } from "@/lib/router";
import { cn } from "@/lib/utils";

function lazySection<P extends object>(
  load: () => Promise<Record<string, ComponentType<P>>>,
  name: string
) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

// Each section is its own chunk, loaded when it's opened.
const GeneralSection = lazySection<SettingsProps>(
  () => import("./sections/GeneralSection"),
  "GeneralSection"
);
const AppearanceSection = lazySection<SettingsProps>(
  () => import("./sections/AppearanceSection"),
  "AppearanceSection"
);
const LayoutSection = lazySection<SettingsProps>(
  () => import("./sections/LayoutSection"),
  "LayoutSection"
);
const WidgetSettings = lazySection<{
  widgets: SettingsProps["widgets"];
  onChange: SettingsProps["onWidgetsChange"];
}>(() => import("./WidgetSettings"), "WidgetSettings");
const WebSearchSettings = lazySection<{
  search: SettingsProps["search"];
  onChange: SettingsProps["onSearchChange"];
}>(() => import("./WebSearchSettings"), "WebSearchSettings");
const AlertSettings = lazySection<object>(() => import("./AlertSettings"), "AlertSettings");
const NotificationSettings = lazySection<object>(
  () => import("./notifications/NotificationSettings"),
  "NotificationSettings"
);
const DockerSection = lazySection<{ showStatsPage: boolean }>(
  () => import("./sections/DockerSection"),
  "DockerSection"
);
const DataSection = lazySection<object>(() => import("./sections/DataSection"), "DataSection");
const SecuritySection = lazySection<{ account?: SettingsProps["account"] }>(
  () => import("./sections/SecuritySection"),
  "SecuritySection"
);

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  layout: LayoutGrid,
  widgets: CloudSun,
  search: Search,
  alerts: TriangleAlert,
  notifications: BellRing,
  docker: Container,
  data: Database,
  security: ShieldCheck,
};

function SectionContent({ id, props }: { id: SettingsSectionId; props: SettingsProps }) {
  switch (id) {
    case "general":
      return <GeneralSection {...props} />;
    case "appearance":
      return <AppearanceSection {...props} />;
    case "layout":
      return <LayoutSection {...props} />;
    case "widgets":
      return <WidgetSettings widgets={props.widgets} onChange={props.onWidgetsChange} />;
    case "search":
      return <WebSearchSettings search={props.search} onChange={props.onSearchChange} />;
    case "alerts":
      return <AlertSettings />;
    case "notifications":
      return <NotificationSettings />;
    case "docker":
      return <DockerSection showStatsPage={props.showStatsPage} />;
    case "data":
      return <DataSection />;
    case "security":
      return <SecuritySection account={props.account} />;
  }
}

function ScopeSwitch({ props }: { props: SettingsProps }) {
  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        role="group"
        aria-label="Applies to"
      >
        {(
          [
            ["all", "All devices"],
            ["device", "This device"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={props.settingsScope === value ? "outline" : "ghost"}
            size="sm"
            aria-pressed={props.settingsScope === value}
            onClick={() => props.onSettingsScopeChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {props.settingsScope === "device"
          ? "Appearance, layout and widget changes apply only to this browser."
          : "Appearance, layout and widget changes apply to every browser."}
      </p>
    </div>
  );
}

interface SettingsPageProps extends SettingsProps {
  /** From the URL; null on /settings, which lists the sections on phones. */
  section: SettingsSectionId | null;
}

/**
 * Settings as a page: sections listed beside the open one, or on phones a list that opens each
 * section on its own with a way back.
 */
export function SettingsPage({ section, ...props }: SettingsPageProps) {
  const current = section ?? "general";
  const label = SETTINGS_SECTIONS.find((entry) => entry.id === current)!.label;

  return (
    <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
      <nav aria-label="Settings" className={cn("md:block", section && "max-md:hidden")}>
        <h1 className="mb-3 text-lg font-semibold tracking-tight md:mb-4">Settings</h1>
        <ul className="space-y-0.5 md:sticky md:top-20">
          {SETTINGS_SECTIONS.map((entry) => {
            const Icon = ICONS[entry.id];
            const active = entry.id === current;
            return (
              <li key={entry.id}>
                <a
                  href={`/settings/${entry.id}`}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => handleLinkClick(event, `/settings/${entry.id}`)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:py-3",
                    active
                      ? "md:bg-accent md:text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{entry.label}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground md:hidden"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        aria-labelledby="settings-section-title"
        className={cn("min-w-0 max-w-2xl space-y-4", !section && "max-md:hidden")}
      >
        <a
          href="/settings"
          onClick={(event) => handleLinkClick(event, "/settings")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Settings
        </a>
        <h2 id="settings-section-title" className="text-lg font-semibold tracking-tight">
          {label}
        </h2>
        {SCOPED_SECTIONS.has(current) && <ScopeSwitch props={props} />}
        {props.settingsError && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {props.settingsError}
          </p>
        )}
        <div
          key={current}
          className="space-y-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        >
          <Suspense
            fallback={
              <div className="h-24 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
            }
          >
            <SectionContent id={current} props={props} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
