import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2, MapPin, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SettingsChoiceRow,
  SettingsToggleRow,
  type ChoiceOption,
} from "@/components/settings/SettingsRows";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  addAgendaFeed,
  fetchAgendaFeeds,
  removeAgendaFeed,
  searchPlaces,
  widgetQueryKeys,
} from "@/lib/api/widgets";
import type {
  AgendaDays,
  ClockFormat,
  DashboardWidgetSettings,
  WeatherUnits,
  WidgetPlacement,
} from "@shared/dashboard-settings";
import type { GeocodeResult } from "@shared/types";

interface WidgetSettingsProps {
  widgets: DashboardWidgetSettings;
  onChange: (widgets: Partial<DashboardWidgetSettings>) => void;
}

const PLACEMENT_OPTIONS: readonly ChoiceOption<WidgetPlacement>[] = [
  { value: "row", label: "Above the board" },
  { value: "header", label: "In the header" },
];

const CLOCK_OPTIONS: readonly ChoiceOption<ClockFormat>[] = [
  { value: "auto", label: "Auto" },
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

const UNIT_OPTIONS: readonly ChoiceOption<WeatherUnits>[] = [
  { value: "metric", label: "°C" },
  { value: "imperial", label: "°F" },
];

const DAY_OPTIONS: readonly ChoiceOption<`${AgendaDays}`>[] = [
  { value: "1", label: "Today" },
  { value: "3", label: "3 days" },
  { value: "7", label: "Week" },
  { value: "14", label: "2 weeks" },
];

const placeName = (place: GeocodeResult) =>
  [place.name, place.region, place.country].filter(Boolean).join(", ");

/** Clock, weather and calendar widgets, and where they show. */
export function WidgetSettings({ widgets, onChange }: WidgetSettingsProps) {
  const row = widgets.placement === "row";
  return (
    <>
      <SettingsChoiceRow
        id="widget-placement"
        title="Placement"
        description="A row of widgets above the board, or small pills in the header"
        options={PLACEMENT_OPTIONS}
        value={widgets.placement}
        onChange={(placement) => onChange({ placement })}
      />
      {row && (
        <SettingsToggleRow
          id="widget-clock"
          title="Clock"
          description="The time and date in large type"
          checked={widgets.clock}
          onCheckedChange={(clock) => onChange({ clock })}
        />
      )}
      {row && widgets.clock && (
        <SettingsToggleRow
          id="widget-greeting"
          title="Greeting"
          description="Good morning, afternoon or evening above the clock"
          checked={widgets.greeting}
          onCheckedChange={(greeting) => onChange({ greeting })}
        />
      )}
      <SettingsChoiceRow
        id="widget-clock-format"
        title="Time format"
        description="For the header clock and the widgets"
        options={CLOCK_OPTIONS}
        value={widgets.clockFormat}
        onChange={(clockFormat) => onChange({ clockFormat })}
      />
      <SettingsToggleRow
        id="widget-weather"
        title="Weather"
        description="Current conditions and a five-day forecast"
        checked={widgets.weather}
        onCheckedChange={(weather) => onChange({ weather })}
      />
      {widgets.weather && <WeatherSettings widgets={widgets} onChange={onChange} />}
      <SettingsToggleRow
        id="widget-agenda"
        title="Agenda"
        description="Upcoming events from your calendars"
        checked={widgets.agenda}
        onCheckedChange={(agenda) => onChange({ agenda })}
      />
      {widgets.agenda && <AgendaSettings widgets={widgets} onChange={onChange} />}
    </>
  );
}

function WeatherSettings({ widgets, onChange }: WidgetSettingsProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const places = useQuery({
    queryKey: ["widgets", "geocode", debounced],
    queryFn: () => searchPlaces(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60 * 60_000,
  });
  const location = widgets.weatherLocation;

  const choose = (place: GeocodeResult) => {
    onChange({
      weatherLocation: {
        name: placeName(place).slice(0, 120),
        latitude: place.latitude,
        longitude: place.longitude,
      },
    });
    setQuery("");
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-2">
        <Label htmlFor={`${id}-place`}>Place</Label>
        {location && (
          <div className="flex items-center gap-2 rounded-md bg-muted/60 py-1.5 pr-1 pl-2.5 text-sm">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{location.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear the place"
              onClick={() => onChange({ weatherLocation: null })}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        <Input
          id={`${id}-place`}
          type="search"
          placeholder={location ? "Search for another place" : "Search for a city or postal code"}
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        {debounced.length >= 2 && (
          <div aria-live="polite">
            {places.isFetching && !places.data ? (
              <p className="text-muted-foreground text-sm">Searching…</p>
            ) : places.error ? (
              <p className="text-destructive text-sm">{places.error.message}</p>
            ) : places.data?.length === 0 ? (
              <p className="text-muted-foreground text-sm">No places match.</p>
            ) : (
              <ul className="space-y-0.5" aria-label="Places">
                {places.data?.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => choose(place)}
                      className="w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {placeName(place)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <SettingsChoiceRow
        id="widget-units"
        title="Units"
        description="Temperature and wind speed"
        options={UNIT_OPTIONS}
        value={widgets.weatherUnits}
        onChange={(weatherUnits) => onChange({ weatherUnits })}
      />
      <p className="text-muted-foreground text-xs">
        Weather data by{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Open-Meteo
        </a>
        .
      </p>
    </div>
  );
}

function AgendaSettings({ widgets, onChange }: WidgetSettingsProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const feeds = useQuery({ queryKey: widgetQueryKeys.feeds, queryFn: fetchAgendaFeeds });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: widgetQueryKeys.feeds });
    void queryClient.invalidateQueries({ queryKey: widgetQueryKeys.agendaRoot });
  };
  const add = useMutation({
    mutationFn: addAgendaFeed,
    onSuccess: () => {
      setName("");
      setUrl("");
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: removeAgendaFeed, onSuccess: refresh });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (url.trim()) add.mutate({ name: name.trim(), url: url.trim() });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <SettingsChoiceRow
        id="widget-agenda-days"
        title="Look ahead"
        description="How far ahead to show events"
        options={DAY_OPTIONS}
        value={`${widgets.agendaDays}`}
        onChange={(days) => onChange({ agendaDays: Number(days) as AgendaDays })}
      />

      <div className="space-y-2">
        <Label>Calendars</Label>
        {feeds.data && feeds.data.length > 0 && (
          <ul className="space-y-1">
            {feeds.data.map((feed) => (
              <li
                key={feed.id}
                className="flex items-center gap-2 rounded-md bg-muted/60 py-1 pr-1 pl-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {feed.name}
                  <span className="text-muted-foreground"> · {feed.host}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${feed.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(feed.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form className="space-y-2" onSubmit={handleSubmit}>
          <Input
            aria-label="Calendar link"
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="iCal link (https:// or webcal://)"
            value={url}
            disabled={add.isPending}
            onChange={(event) => setUrl(event.target.value)}
          />
          <div className="flex gap-2">
            <Input
              aria-label="Calendar name"
              placeholder="Name (optional)"
              value={name}
              maxLength={60}
              disabled={add.isPending}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              className="shrink-0"
              disabled={add.isPending || !url.trim()}
            >
              {add.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <CalendarPlus aria-hidden="true" />
              )}
              Add
            </Button>
          </div>
        </form>
        {(add.error || remove.error || feeds.error) && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {(add.error ?? remove.error ?? feeds.error)?.message}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Links stay on the server; the dashboard only shows event titles and times.
        </p>
      </div>
    </div>
  );
}
