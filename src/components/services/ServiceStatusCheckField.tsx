import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  checkIntervalOptions,
  formatCheckInterval,
} from "@/components/services/status-check-options";
import type {
  ServiceDialogFieldIds,
  ServiceDialogFormState,
} from "@/components/services/useServiceDialogState";
import { describeCheckTarget, resolveCheckTarget } from "@shared/status";
import type { StatusCheckMethod } from "@shared/types";

type CheckState = Pick<
  ServiceDialogFormState,
  "checkEnabled" | "checkIgnoreTls" | "checkInterval" | "checkMethod" | "checkTarget"
>;

interface ServiceStatusCheckFieldProps {
  fieldIds: ServiceDialogFieldIds;
  /** The link URL as typed, for the placeholder of what gets checked by default. */
  linkUrl: string;
  onChange: (patch: Partial<CheckState>) => void;
  value: CheckState;
}

const METHOD_LABEL: Record<StatusCheckMethod, string> = { http: "HTTP", tcp: "TCP port" };

/** Status check settings: off by default, a toggle that opens method, interval and target. */
export function ServiceStatusCheckField({
  fieldIds,
  linkUrl,
  onChange,
  value,
}: ServiceStatusCheckFieldProps) {
  const defaultTarget = resolveCheckTarget(
    { check_method: value.checkMethod, check_target: null },
    linkUrl
  );
  const placeholder = defaultTarget
    ? describeCheckTarget(defaultTarget)
    : value.checkMethod === "http"
      ? "https://example.com/health"
      : "nas.lan:22";
  const enabledLabelId = `${fieldIds.checkEnabledInputId}-label`;
  const methodLabelId = `${fieldIds.checkMethodInputId}-label`;
  const intervalLabelId = `${fieldIds.checkIntervalInputId}-label`;
  const tlsLabelId = `${fieldIds.checkIgnoreTlsInputId}-label`;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label id={enabledLabelId} htmlFor={fieldIds.checkEnabledInputId} className="font-semibold">
          Status check
        </Label>
        <Switch
          id={fieldIds.checkEnabledInputId}
          aria-labelledby={enabledLabelId}
          checked={value.checkEnabled}
          onCheckedChange={(checkEnabled) => onChange({ checkEnabled })}
        />
      </div>

      {value.checkEnabled && (
        <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label
                id={methodLabelId}
                htmlFor={fieldIds.checkMethodInputId}
                className="text-xs text-muted-foreground"
              >
                Method
              </Label>
              <Select
                value={value.checkMethod}
                onValueChange={(method) => onChange({ checkMethod: method as StatusCheckMethod })}
              >
                <SelectTrigger
                  id={fieldIds.checkMethodInputId}
                  aria-labelledby={methodLabelId}
                  className="w-full font-normal"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as StatusCheckMethod[]).map((method) => (
                    <SelectItem key={method} value={method}>
                      {METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label
                id={intervalLabelId}
                htmlFor={fieldIds.checkIntervalInputId}
                className="text-xs text-muted-foreground"
              >
                Every
              </Label>
              <Select
                value={String(value.checkInterval)}
                onValueChange={(interval) => onChange({ checkInterval: Number(interval) })}
              >
                <SelectTrigger
                  id={fieldIds.checkIntervalInputId}
                  aria-labelledby={intervalLabelId}
                  className="w-full font-normal"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {checkIntervalOptions(value.checkInterval).map((seconds) => (
                    <SelectItem key={seconds} value={String(seconds)}>
                      {formatCheckInterval(seconds)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldIds.checkTargetInputId} className="text-xs text-muted-foreground">
              {value.checkMethod === "http" ? "Check URL" : "Host and port"}
            </Label>
            <Input
              id={fieldIds.checkTargetInputId}
              name="checkTarget"
              autoComplete="off"
              spellCheck={false}
              value={value.checkTarget}
              onChange={(event) => onChange({ checkTarget: event.target.value })}
              placeholder={placeholder}
              className="font-mono text-xs"
            />
          </div>

          {value.checkMethod === "http" && (
            <div className="flex items-center justify-between gap-3">
              <Label
                id={tlsLabelId}
                htmlFor={fieldIds.checkIgnoreTlsInputId}
                className="text-xs text-muted-foreground"
              >
                Allow self-signed certificates
              </Label>
              <Switch
                id={fieldIds.checkIgnoreTlsInputId}
                aria-labelledby={tlsLabelId}
                size="sm"
                checked={value.checkIgnoreTls}
                onCheckedChange={(checkIgnoreTls) => onChange({ checkIgnoreTls })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
