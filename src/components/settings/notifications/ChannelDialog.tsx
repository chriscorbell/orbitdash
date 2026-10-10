import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TestResultLine, type TestState } from "@/components/settings/notifications/TestResultLine";
import type { ChannelPayload } from "@/lib/api/notifications";
import {
  asSentence,
  CHANNEL_ICONS,
  draftFromChannel,
  emptyDraft,
  nextHeaderKey,
  payloadFromDraft,
  priorityChoices,
  switchDraftType,
  validateDraft,
  type ChannelDraft,
} from "@/lib/notifications";
import { CHANNEL_TYPE_LABELS, NOTIFICATION_CHANNEL_TYPES } from "@shared/notifications";
import type {
  NotificationChannel,
  NotificationChannelType,
  NotificationTestResult,
} from "@shared/types";

interface ChannelDialogProps {
  /** The channel to edit, or null to add one. */
  channel: NotificationChannel | null;
  onClose: () => void;
  onCreate: (payload: ChannelPayload) => Promise<unknown>;
  onSave: (id: string, payload: ChannelPayload) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string | null, payload: ChannelPayload) => Promise<NotificationTestResult>;
}

const errorText = (error: unknown, fallback: string) =>
  asSentence(error instanceof Error && error.message ? error.message : fallback);

const savedPlaceholder = (mask: string | null, fallback: string) =>
  mask ? `Saved (${mask})` : fallback;

function Field({
  action,
  children,
  id,
  label,
  optional = false,
}: {
  action?: ReactNode;
  children: ReactNode;
  id: string;
  label: string;
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="font-semibold">
          {label}
          {optional && <span className="text-muted-foreground font-normal">optional</span>}
        </Label>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Four segmented choices; arrow keys move between them like native radios. */
function TypePicker({
  value,
  onChange,
}: {
  value: NotificationChannelType;
  onChange: (type: NotificationChannelType) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key] ?? 0;
    if (step === 0) return;
    event.preventDefault();
    const count = NOTIFICATION_CHANNEL_TYPES.length;
    const next = (NOTIFICATION_CHANNEL_TYPES.indexOf(value) + step + count) % count;
    onChange(NOTIFICATION_CHANNEL_TYPES[next]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Channel type"
      className="grid grid-cols-4 gap-2"
      onKeyDown={handleKeyDown}
    >
      {NOTIFICATION_CHANNEL_TYPES.map((type) => {
        const checked = type === value;
        const Icon = CHANNEL_ICONS[type];
        return (
          <Button
            key={type}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            variant={checked ? "outline" : "ghost"}
            className="h-14 flex-col gap-1 text-xs"
            onClick={() => onChange(type)}
          >
            <Icon aria-hidden="true" />
            {CHANNEL_TYPE_LABELS[type]}
          </Button>
        );
      })}
    </div>
  );
}

/** Adds or edits one channel: only the fields its type needs, a test, and its events. */
export function ChannelDialog({
  channel,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onTest,
}: ChannelDialogProps) {
  const id = useId();
  const [draft, setDraft] = useState<ChannelDraft>(() =>
    channel ? draftFromChannel(channel) : emptyDraft("ntfy")
  );
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const change = (patch: Partial<ChannelDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setTest(null);
  };
  const field = (name: string) => `${id}-${name}`;

  const ready = (): ChannelPayload | null => {
    const problem = validateDraft(draft);
    setError(problem);
    return problem ? null : payloadFromDraft(draft);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = ready();
    if (!payload) return;
    setBusy("save");
    try {
      await (channel ? onSave(channel.id, payload) : onCreate(payload));
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "Couldn't save the channel"));
      setBusy(null);
    }
  };

  const handleTest = async () => {
    const payload = ready();
    if (!payload) return;
    setBusy("test");
    setTest({ sending: true });
    try {
      const result = await onTest(channel?.id ?? null, payload);
      setTest({ sending: false, ok: result.ok, error: result.error });
    } catch (testError) {
      setTest({ sending: false, ok: false, error: errorText(testError, "Couldn't send the test") });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!channel) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy("delete");
    try {
      await onDelete(channel.id);
      onClose();
    } catch (deleteError) {
      setError(errorText(deleteError, "Couldn't delete the channel"));
      setBusy(null);
    }
  };

  const updateHeader = (key: number, patch: { name?: string; value?: string }) =>
    change({
      headers: draft.headers.map((header) =>
        header.key === key ? { ...header, ...patch } : header
      ),
    });

  const secretInput = {
    autoComplete: "off",
    autoCapitalize: "off",
    spellCheck: false,
    className: "font-mono",
  } as const;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channel ? `Edit ${channel.name}` : "Add channel"}</DialogTitle>
          <DialogDescription className="sr-only">
            Where notifications go and which events are sent there.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          {!channel && (
            <TypePicker
              value={draft.type}
              onChange={(type) => {
                setDraft((current) => switchDraftType(current, type));
                setTest(null);
                setError(null);
              }}
            />
          )}

          <Field id={field("name")} label="Name">
            <Input
              id={field("name")}
              value={draft.name}
              maxLength={60}
              onChange={(event) => change({ name: event.target.value })}
            />
          </Field>

          {(draft.type === "ntfy" || draft.type === "gotify") && (
            <Field id={field("server")} label="Server">
              <Input
                id={field("server")}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={draft.type === "gotify" ? "https://gotify.example.com" : undefined}
                value={draft.server}
                onChange={(event) => change({ server: event.target.value })}
              />
            </Field>
          )}

          {draft.type === "ntfy" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={field("topic")} label="Topic">
                  <Input
                    id={field("topic")}
                    {...secretInput}
                    placeholder={savedPlaceholder(draft.saved.topic, "homelab-alerts")}
                    value={draft.topic}
                    onChange={(event) => change({ topic: event.target.value })}
                  />
                </Field>
                <PriorityField
                  id={field("priority")}
                  type="ntfy"
                  value={draft.priority}
                  onChange={(priority) => change({ priority })}
                />
              </div>
              <Field
                id={field("token")}
                label="Access token"
                optional
                action={
                  draft.saved.token && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={draft.removeToken}
                      onClick={() => change({ removeToken: !draft.removeToken, token: "" })}
                    >
                      {draft.removeToken ? "Keep token" : "Remove token"}
                    </Button>
                  )
                }
              >
                <Input
                  id={field("token")}
                  type="password"
                  {...secretInput}
                  disabled={draft.removeToken}
                  placeholder={
                    draft.removeToken
                      ? "Removed when you save"
                      : savedPlaceholder(draft.saved.token, "tk_…")
                  }
                  value={draft.token}
                  onChange={(event) => change({ token: event.target.value })}
                />
              </Field>
              <Field id={field("tags")} label="Tags" optional>
                <Input
                  id={field("tags")}
                  placeholder="server, homelab"
                  value={draft.tags}
                  onChange={(event) => change({ tags: event.target.value })}
                />
              </Field>
            </>
          )}

          {draft.type === "gotify" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={field("token")} label="App token">
                <Input
                  id={field("token")}
                  type="password"
                  {...secretInput}
                  placeholder={savedPlaceholder(draft.saved.token, "")}
                  value={draft.token}
                  onChange={(event) => change({ token: event.target.value })}
                />
              </Field>
              <PriorityField
                id={field("priority")}
                type="gotify"
                value={draft.priority}
                onChange={(priority) => change({ priority })}
              />
            </div>
          )}

          {(draft.type === "discord" || draft.type === "webhook") && (
            <Field id={field("url")} label={draft.type === "discord" ? "Webhook URL" : "URL"}>
              <Input
                id={field("url")}
                inputMode="url"
                {...secretInput}
                placeholder={savedPlaceholder(
                  draft.saved.url,
                  draft.type === "discord"
                    ? "https://discord.com/api/webhooks/…"
                    : "https://example.com/hooks/orbitdash"
                )}
                value={draft.url}
                onChange={(event) => change({ url: event.target.value })}
              />
            </Field>
          )}

          {draft.type === "webhook" && (
            <div className="space-y-2" role="group" aria-labelledby={field("headers")}>
              <div className="flex items-center justify-between gap-2">
                <p id={field("headers")} className="text-sm font-semibold">
                  Headers
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    change({
                      headers: [
                        ...draft.headers,
                        { key: nextHeaderKey(), name: "", value: "", saved: null },
                      ],
                    })
                  }
                >
                  <Plus aria-hidden="true" />
                  Add header
                </Button>
              </div>
              {draft.headers.map((header, index) => (
                <div
                  key={header.key}
                  className="flex items-center gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
                >
                  <Input
                    aria-label={`Header ${index + 1} name`}
                    placeholder="Authorization"
                    {...secretInput}
                    value={header.name}
                    onChange={(event) => updateHeader(header.key, { name: event.target.value })}
                  />
                  <Input
                    aria-label={`Header ${index + 1} value`}
                    type="password"
                    {...secretInput}
                    placeholder={savedPlaceholder(header.saved, "Value")}
                    value={header.value}
                    onChange={(event) => updateHeader(header.key, { value: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove header ${header.name || index + 1}`}
                    onClick={() =>
                      change({ headers: draft.headers.filter((entry) => entry.key !== header.key) })
                    }
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2.5" role="group" aria-labelledby={field("events")}>
            <p id={field("events")} className="text-sm font-semibold">
              Send
            </p>
            {(
              [
                ["status", "Status changes", "A service goes down or comes back"],
                ["alerts", "Metric alerts", "An alert fires or resolves"],
              ] as const
            ).map(([kind, title, description]) => (
              <div key={kind} className="flex items-start gap-2">
                <Checkbox
                  id={field(kind)}
                  className="mt-0.5"
                  checked={draft.events[kind]}
                  aria-describedby={field(`${kind}-description`)}
                  onCheckedChange={(checked) =>
                    change({ events: { ...draft.events, [kind]: checked === true } })
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor={field(kind)}>{title}</Label>
                  <p id={field(`${kind}-description`)} className="text-muted-foreground text-xs">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div aria-live="polite">{test && <TestResultLine state={test} />}</div>
          {error && (
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
            </p>
          )}

          <DialogFooter className="flex-row flex-wrap items-center justify-end">
            {channel && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                disabled={busy !== null}
                onBlur={() => setConfirmingDelete(false)}
                onClick={() => void handleDelete()}
              >
                {busy === "delete" ? "Deleting…" : confirmingDelete ? "Delete channel?" : "Delete"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void handleTest()}
            >
              {busy === "test" ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Send test
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : channel ? "Save changes" : "Add channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PriorityField({
  id,
  type,
  value,
  onChange,
}: {
  id: string;
  type: "ntfy" | "gotify";
  value: number;
  onChange: (priority: number) => void;
}) {
  return (
    <Field id={id} label="Priority">
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {priorityChoices(type, value).map((choice) => (
            <SelectItem key={choice.value} value={String(choice.value)}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
