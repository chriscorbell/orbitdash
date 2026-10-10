import { useMemo, type ReactNode } from "react";
import {
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMinuteTicker } from "@/hooks/useMinuteTicker";
import { groupAgenda, type AgendaDay } from "@/lib/agenda";
import { greetingFor, timeFormatter } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { describeWeather, formatTemperature, weekdayOf, type WeatherKind } from "@/lib/weather";
import { useAgenda, useWeather } from "@/components/widgets/useWidgetData";
import type { DashboardWidgetSettings } from "@shared/dashboard-settings";
import type { WeatherReport } from "@shared/types";

interface WidgetProps {
  widgets: DashboardWidgetSettings;
  onOpenSettings: () => void;
}

const ICONS: Record<WeatherKind, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  snow: [CloudSnow, CloudSnow],
  storm: [CloudLightning, CloudLightning],
};

function WeatherIcon({
  code,
  isDay = true,
  className,
}: {
  code: number;
  isDay?: boolean;
  className?: string;
}) {
  const Icon = ICONS[describeWeather(code).kind][isDay ? 0 : 1];
  return <Icon aria-hidden="true" className={className} />;
}

const MAX_AGENDA_ITEMS = 4;

/** The row of widgets above the board, three columns lined up with the stats strip. */
export function WidgetRow({ widgets, onOpenSettings }: WidgetProps) {
  const panels = [
    widgets.clock && <ClockPanel key="clock" widgets={widgets} />,
    widgets.weather && (
      <WeatherPanel key="weather" widgets={widgets} onOpenSettings={onOpenSettings} />
    ),
    widgets.agenda && (
      <AgendaPanel key="agenda" widgets={widgets} onOpenSettings={onOpenSettings} />
    ),
  ].filter(Boolean);
  if (panels.length === 0) return null;

  return (
    <section aria-label="Widgets" className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
      {panels}
    </section>
  );
}

function Panel({
  children,
  className,
  label,
}: {
  children?: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card px-3.5 py-3 shadow-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

function ClockPanel({ widgets }: { widgets: DashboardWidgetSettings }) {
  const now = useMinuteTicker();
  const time = useMemo(() => timeFormatter(widgets.clockFormat), [widgets.clockFormat]);
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  return (
    <Panel label="Clock" className="justify-center">
      {widgets.greeting && (
        <p className="text-sm text-muted-foreground">{greetingFor(new Date(now).getHours())}</p>
      )}
      <time
        dateTime={new Date(now).toISOString()}
        className="text-4xl leading-tight font-semibold tracking-tight tabular-nums"
      >
        {time.format(now)}
      </time>
      <p className="text-sm text-muted-foreground">{date}</p>
    </Panel>
  );
}

function PanelMessage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}

function WeatherPanel({ widgets, onOpenSettings }: WidgetProps) {
  const { data, error, isPending } = useWeather(widgets);
  const location = widgets.weatherLocation;

  if (!location) {
    return (
      <Panel label="Weather">
        <PanelMessage
          action={
            <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              Choose a place
            </Button>
          }
        >
          Weather needs a place.
        </PanelMessage>
      </Panel>
    );
  }
  if (isPending)
    return (
      <Panel label="Weather" className="animate-pulse motion-reduce:animate-none">
        <div className="h-24" />
        <span className="sr-only">Loading weather</span>
      </Panel>
    );
  if (error || !data) {
    return (
      <Panel label="Weather">
        <PanelMessage>{error?.message ?? "Weather is unavailable right now"}</PanelMessage>
      </Panel>
    );
  }
  return <WeatherReportView location={location.name} report={data} />;
}

function WeatherReportView({ location, report }: { location: string; report: WeatherReport }) {
  const { current } = report;
  const today = report.daily[0];
  const condition = describeWeather(current.weatherCode).label;

  return (
    <Panel label={`Weather in ${location}`} className="justify-between gap-3">
      <div className="flex items-center gap-3">
        <WeatherIcon
          code={current.weatherCode}
          isDay={current.isDay}
          className="h-8 w-8 shrink-0 text-brand"
        />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
              {formatTemperature(current.temperature)}
            </span>
            <span className="truncate text-sm">{condition}</span>
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {location.split(",")[0]}
            {today && ` · H ${formatTemperature(today.max)} L ${formatTemperature(today.min)}`}
          </p>
        </div>
      </div>
      <ol className="grid grid-cols-5 gap-1 text-center" aria-label="Forecast">
        {report.daily.slice(1, 6).map((day) => (
          <li key={day.date} className="flex flex-col items-center gap-0.5 text-xs">
            <span className="text-muted-foreground">{weekdayOf(day.date)}</span>
            <WeatherIcon code={day.weatherCode} className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">{describeWeather(day.weatherCode).label}</span>
            <span className="font-mono tabular-nums">
              {formatTemperature(day.max)}
              <span className="text-muted-foreground"> {formatTemperature(day.min)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function useAgendaDays(widgets: DashboardWidgetSettings) {
  const { agenda, feeds } = useAgenda(widgets);
  const now = useMinuteTicker();
  const time = useMemo(() => timeFormatter(widgets.clockFormat), [widgets.clockFormat]);
  const days = useMemo(
    () =>
      agenda.data
        ? groupAgenda(agenda.data.events, now, widgets.agendaDays, (ms) => time.format(ms))
        : [],
    [agenda.data, now, time, widgets.agendaDays]
  );
  return { agenda, feeds, days };
}

function AgendaPanel({ widgets, onOpenSettings }: WidgetProps) {
  const { agenda, feeds, days } = useAgendaDays(widgets);

  if (feeds.data?.length === 0) {
    return (
      <Panel label="Agenda">
        <PanelMessage
          action={
            <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
              <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
              Add a calendar
            </Button>
          }
        >
          No calendars yet.
        </PanelMessage>
      </Panel>
    );
  }
  if (agenda.isPending || feeds.isPending) {
    return (
      <Panel label="Agenda" className="animate-pulse motion-reduce:animate-none">
        <div className="h-24" />
        <span className="sr-only">Loading calendar</span>
      </Panel>
    );
  }
  if (agenda.error) {
    return (
      <Panel label="Agenda">
        <PanelMessage>{agenda.error.message}</PanelMessage>
      </Panel>
    );
  }

  const failed = agenda.data?.errors ?? [];
  return (
    <Panel label="Agenda" className="gap-2">
      {days.length === 0 ? (
        <PanelMessage>
          {widgets.agendaDays === 1
            ? "Nothing else today."
            : `Nothing in the next ${widgets.agendaDays} days.`}
        </PanelMessage>
      ) : (
        <AgendaList days={days} limit={MAX_AGENDA_ITEMS} />
      )}
      {failed.length > 0 && (
        <p
          className="truncate text-xs text-muted-foreground"
          title={failed.map((f) => `${f.name}: ${f.error}`).join("\n")}
        >
          {failed.length === 1
            ? `${failed[0].name} couldn't be loaded`
            : `${failed.length} calendars couldn't be loaded`}
        </p>
      )}
    </Panel>
  );
}

function AgendaList({ days, limit }: { days: AgendaDay[]; limit: number }) {
  let remaining = limit;
  const total = days.reduce((sum, day) => sum + day.items.length, 0);
  const shown: AgendaDay[] = [];
  for (const day of days) {
    if (remaining <= 0) break;
    shown.push({ ...day, items: day.items.slice(0, remaining) });
    remaining -= day.items.length;
  }
  const hidden = total - limit;

  return (
    <div className="space-y-2">
      {shown.map((day) => (
        <div key={day.key}>
          <p className="text-xs font-medium text-muted-foreground">{day.label}</p>
          <ul className="mt-0.5 space-y-0.5">
            {day.items.map(({ event, when }) => (
              <li key={event.id} className="flex min-w-0 items-baseline gap-2.5 text-sm">
                <span
                  className={cn(
                    "w-20 shrink-0 font-mono text-xs tabular-nums",
                    when === "Now" ? "text-brand" : "text-muted-foreground"
                  )}
                >
                  {when}
                </span>
                <span className="min-w-0 truncate" title={event.location ?? undefined}>
                  {event.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hidden > 0 && <p className="text-xs text-muted-foreground">{hidden} more</p>}
    </div>
  );
}

/** Weather and the next event as small pills in the header. */
export function HeaderWidgets({ widgets }: { widgets: DashboardWidgetSettings }) {
  return (
    <>
      {widgets.weather && widgets.weatherLocation && <HeaderWeather widgets={widgets} />}
      {widgets.agenda && <HeaderNextEvent widgets={widgets} />}
    </>
  );
}

function HeaderWeather({ widgets }: { widgets: DashboardWidgetSettings }) {
  const { data } = useWeather(widgets);
  if (!data) return null;
  const condition = describeWeather(data.current.weatherCode).label;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-foreground animate-in fade-in-0 duration-300 lg:inline-flex"
      title={`${condition} in ${widgets.weatherLocation?.name}, feels like ${formatTemperature(data.current.apparentTemperature)}`}
    >
      <WeatherIcon
        code={data.current.weatherCode}
        isDay={data.current.isDay}
        className="h-3.5 w-3.5 text-brand"
      />
      {formatTemperature(data.current.temperature)}
      <span className="sr-only">{condition}</span>
    </span>
  );
}

function HeaderNextEvent({ widgets }: { widgets: DashboardWidgetSettings }) {
  const { days } = useAgendaDays({ ...widgets, agendaDays: 1 });
  const next = days[0]?.items.find((item) => !item.event.allDay) ?? days[0]?.items[0];
  if (!next) return null;
  return (
    <span
      className="hidden max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 animate-in fade-in-0 duration-300 lg:inline-flex"
      title={`${next.when}: ${next.event.title}`}
    >
      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className={cn("shrink-0", next.when === "Now" && "text-brand")}>{next.when}</span>
      <span className="truncate text-foreground">{next.event.title}</span>
    </span>
  );
}
