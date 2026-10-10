import { useState } from "react";
import { Check, Pencil, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChannelDialog } from "@/components/settings/notifications/ChannelDialog";
import { TestResultLine, type TestState } from "@/components/settings/notifications/TestResultLine";
import { useNotifications } from "@/hooks/useNotifications";
import {
  asSentence,
  CHANNEL_ICONS,
  channelTarget,
  describeDeliveryFailure,
  describeEvents,
  formatDeliveryTime,
  listTimeZones,
  shortZoneName,
} from "@/lib/notifications";
import { toastError } from "@/lib/toast";
import {
  CHANNEL_TYPE_LABELS,
  describeDownDelay,
  DOWN_DELAY_MINUTES,
  parseClock,
} from "@shared/notifications";
import type { NotificationChannel, NotificationDelivery, NotificationOptions } from "@shared/types";

const LOG_PREVIEW = 5;
const SERVER_ZONE = "server";

/** Channels, when to notify, and what was sent: the Notifications section of settings. */
export function NotificationSettings() {
  const notifications = useNotifications();
  const { data, error, testChannel } = notifications;
  /** null: closed; { channel: null }: adding; otherwise editing that channel. */
  const [dialog, setDialog] = useState<{ channel: NotificationChannel | null } | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  if (!data) {
    return error ? (
      <p role="alert" className="text-destructive text-sm font-medium">
        {error}
      </p>
    ) : (
      <div className="h-24 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
    );
  }

  const runTest = async (channel: NotificationChannel) => {
    setTests((current) => ({ ...current, [channel.id]: { sending: true } }));
    let state: TestState;
    try {
      const result = await testChannel(channel.id);
      state = { sending: false, ok: result.ok, error: result.error };
    } catch (testError) {
      state = {
        sending: false,
        ok: false,
        error: asSentence(
          testError instanceof Error ? testError.message : "Couldn't send the test"
        ),
      };
    }
    setTests((current) => ({ ...current, [channel.id]: state }));
  };

  const saveOptions = (options: NotificationOptions) => {
    notifications
      .saveOptions(options)
      .catch((saveError) => toastError(saveError, "Couldn't save notification options"));
  };

  return (
    <div className="space-y-3">
      {data.channels.length === 0 ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">No channels yet</p>
            <p className="text-muted-foreground text-sm">
              Get outages and alerts on ntfy, Gotify, Discord or a webhook.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setDialog({ channel: null })}
          >
            <Plus aria-hidden="true" />
            Add channel
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <ul
            aria-label="Notification channels"
            className="divide-y divide-border rounded-lg border border-border"
          >
            {data.channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                test={tests[channel.id] ?? null}
                onEdit={() => setDialog({ channel })}
                onTest={() => void runTest(channel)}
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDialog({ channel: null })}
          >
            <Plus aria-hidden="true" />
            Add channel
          </Button>
        </div>
      )}

      <OptionsRows
        options={data.options}
        serverTimeZone={data.serverTimeZone}
        onChange={saveOptions}
      />

      {data.deliveries.length > 0 && <DeliveryLog deliveries={data.deliveries} />}

      {dialog && (
        <ChannelDialog
          channel={dialog.channel}
          onClose={() => setDialog(null)}
          onCreate={notifications.createChannel}
          onSave={notifications.saveChannel}
          onDelete={notifications.removeChannel}
          onTest={testChannel}
        />
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  test,
  onEdit,
  onTest,
}: {
  channel: NotificationChannel;
  test: TestState | null;
  onEdit: () => void;
  onTest: () => void;
}) {
  const Icon = CHANNEL_ICONS[channel.type];
  const paused = !channel.events.status && !channel.events.alerts;

  return (
    <li className="flex items-start gap-3 p-3">
      <Icon
        aria-hidden="true"
        className={
          paused
            ? "mt-0.5 h-4 w-4 shrink-0 opacity-40"
            : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        }
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-medium">{channel.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              <span className="sr-only">{CHANNEL_TYPE_LABELS[channel.type]}, </span>
              {channelTarget(channel)} · {describeEvents(channel.events)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Send a test to ${channel.name}`}
            disabled={test?.sending === true}
            onClick={onTest}
          >
            <Send aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${channel.name}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
        <div aria-live="polite">{test && <TestResultLine state={test} />}</div>
      </div>
    </li>
  );
}

function OptionsRows({
  options,
  serverTimeZone,
  onChange,
}: {
  options: NotificationOptions;
  serverTimeZone: string;
  onChange: (options: NotificationOptions) => void;
}) {
  const { quietHours } = options;
  const zones = listTimeZones([serverTimeZone, options.timeZone]);

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4 p-3">
        <div className="space-y-0.5">
          <Label htmlFor="notify-down-delay">Report outages</Label>
          <p id="notify-down-delay-description" className="text-muted-foreground text-sm">
            Shorter blips stay quiet
          </p>
        </div>
        <Select
          value={String(options.downDelayMinutes)}
          onValueChange={(value) => onChange({ ...options, downDelayMinutes: Number(value) })}
        >
          <SelectTrigger
            id="notify-down-delay"
            aria-describedby="notify-down-delay-description"
            className="w-36 shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOWN_DELAY_MINUTES.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {describeDownDelay(minutes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="notify-quiet-hours">Quiet hours</Label>
            <p id="notify-quiet-hours-description" className="text-muted-foreground text-sm">
              Hold messages, then send a summary
            </p>
          </div>
          <Switch
            id="notify-quiet-hours"
            aria-describedby="notify-quiet-hours-description"
            checked={quietHours.enabled}
            onCheckedChange={(enabled) =>
              onChange({ ...options, quietHours: { ...quietHours, enabled } })
            }
          />
        </div>
        {quietHours.enabled && (
          <QuietWindow
            start={quietHours.start}
            end={quietHours.end}
            onChange={(window) =>
              onChange({ ...options, quietHours: { ...quietHours, ...window } })
            }
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-4 p-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="notify-time-zone">Time zone</Label>
          <p id="notify-time-zone-description" className="text-muted-foreground text-sm">
            For quiet hours and messages
          </p>
        </div>
        <Select
          value={options.timeZone ?? SERVER_ZONE}
          onValueChange={(value) =>
            onChange({ ...options, timeZone: value === SERVER_ZONE ? null : value })
          }
        >
          <SelectTrigger
            id="notify-time-zone"
            aria-describedby="notify-time-zone-description"
            className="w-36 shrink-0"
          >
            <SelectValue>
              {options.timeZone ? shortZoneName(options.timeZone) : "Server time"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={SERVER_ZONE}>Server time ({serverTimeZone})</SelectItem>
            <SelectSeparator />
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * From and to times, saved when a field is left with a valid, different time. Typed values live
 * here only until then, so another tab's change shows up without remounting the inputs (which
 * would take focus away while tabbing from one to the other).
 */
function QuietWindow({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (window: { start: string; end: string }) => void;
}) {
  const [editing, setEditing] = useState<{ start: string; end: string } | null>(null);
  const values = editing ?? { start, end };

  const commit = () => {
    if (!editing) return;
    setEditing(null);
    const valid =
      parseClock(editing.start) !== null &&
      parseClock(editing.end) !== null &&
      editing.start !== editing.end;
    if (valid && (editing.start !== start || editing.end !== end)) onChange(editing);
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <span>From</span>
      {(["start", "end"] as const).map((edge) => (
        <span key={edge} className="contents">
          {edge === "end" && <span>to</span>}
          <Input
            type="time"
            step={60}
            required
            aria-label={edge === "start" ? "Quiet hours start" : "Quiet hours end"}
            className="flex-1 tabular-nums"
            value={values[edge]}
            onChange={(event) => setEditing({ ...values, [edge]: event.target.value })}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
        </span>
      ))}
    </div>
  );
}

function DeliveryLog({ deliveries }: { deliveries: NotificationDelivery[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? deliveries : deliveries.slice(0, LOG_PREVIEW);

  return (
    <section aria-labelledby="notify-log-label" className="space-y-2">
      <h4 id="notify-log-label" className="text-muted-foreground text-xs font-medium">
        Recent deliveries
      </h4>
      <ul className="space-y-2">
        {shown.map((delivery) => (
          <li
            key={delivery.id}
            className="flex items-start gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
          >
            {delivery.ok ? (
              <Check
                role="img"
                aria-label="Delivered"
                className="text-success mt-0.5 h-3.5 w-3.5 shrink-0"
              />
            ) : (
              <X
                role="img"
                aria-label="Not delivered"
                className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{delivery.title}</p>
              <p className="text-muted-foreground truncate text-xs">
                {delivery.channelName} ·{" "}
                <time dateTime={new Date(delivery.sentAt).toISOString()}>
                  {formatDeliveryTime(delivery.sentAt)}
                </time>
                {!delivery.ok && (
                  <span className="text-destructive">, {describeDeliveryFailure(delivery)}</span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {deliveries.length > LOG_PREVIEW && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer" : `Show all ${deliveries.length}`}
        </Button>
      )}
    </section>
  );
}
