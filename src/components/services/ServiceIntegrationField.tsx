import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, LoaderCircle } from "lucide-react";
import { IntegrationStats } from "@/components/integrations/IntegrationStats";
import { Button } from "@/components/ui/button";
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
import { fetchDocker } from "@/lib/api/docker";
import { fetchIntegrationTypes, testIntegration } from "@/lib/api/integrations";
import {
  changeType,
  draftProblem,
  draftValues,
  integrationIconUrl,
  type IntegrationDraft,
} from "@/lib/integration-draft";
import { normalizeServiceUrl } from "@shared/urls";
import type { IntegrationField, ServiceIntegration } from "@shared/types";

const NONE = "__none__";

interface ServiceIntegrationFieldProps {
  draft: IntegrationDraft;
  /** The saved integration, so switching back to its type restores it. */
  original: ServiceIntegration | null;
  serviceId: string | null;
  linkUrl: string;
  onChange: (draft: IntegrationDraft) => void;
}

/** Integration settings: none by default; picking an app opens only the fields it needs. */
export function ServiceIntegrationField({
  draft,
  original,
  serviceId,
  linkUrl,
  onChange,
}: ServiceIntegrationFieldProps) {
  const id = useId();
  const types = useQuery({
    queryKey: ["integrations", "types"],
    queryFn: fetchIntegrationTypes,
    staleTime: Infinity,
  });
  const type = types.data?.find((entry) => entry.id === draft.type);
  const [tested, setTested] = useState<{ key: string; error: string | null } | null>(null);
  const test = useMutation({ mutationFn: testIntegration });
  const testKey = JSON.stringify([draft, linkUrl]);
  const result = test.data && tested?.key === testKey ? test.data : null;
  const problem = draftProblem(draft, type);

  const setValue = (key: string, value: string | boolean) =>
    onChange({ ...draft, values: { ...draft.values, [key]: value } });

  const runTest = () => {
    const url = normalizeServiceUrl(linkUrl);
    if (!type || !url) return;
    test.mutate(
      { serviceId, url, type: type.id, values: draftValues(draft, type) },
      { onSuccess: () => setTested({ key: testKey, error: null }) }
    );
  };

  // Mounted once the options exist, so the picker never holds a value it can't show.
  if (!types.data || types.data.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label id={`${id}-label`} htmlFor={`${id}-type`} className="font-semibold">
          Integration
        </Label>
        <Select
          value={draft.type ?? NONE}
          onValueChange={(value) => {
            if (value) onChange(changeType(value === NONE ? null : value, original));
          }}
        >
          <SelectTrigger
            id={`${id}-type`}
            aria-labelledby={`${id}-label`}
            className="w-48 font-normal"
          >
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {types.data?.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <img
                  src={integrationIconUrl(entry.icon)}
                  alt=""
                  className="h-4 w-4 object-contain"
                />
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {type && (
        <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          {type.fields.map((field) => (
            <IntegrationInput
              key={`${type.id}:${field.key}`}
              id={`${id}-${field.key}`}
              field={field}
              typeId={type.id}
              value={draft.values[field.key]}
              secretSet={draft.secretsSet.includes(field.key)}
              linkUrl={linkUrl}
              onChange={(value) => setValue(field.key, value)}
            />
          ))}
          <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={problem !== null || !normalizeServiceUrl(linkUrl) || test.isPending}
              title={problem ?? undefined}
              onClick={runTest}
            >
              {test.isPending ? (
                <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              Test
            </Button>
            <div aria-live="polite" className="min-w-0 flex-1">
              {test.error && !test.isPending ? (
                <p className="text-xs text-destructive">{test.error.message}</p>
              ) : result ? (
                <IntegrationStats reading={result} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationInput({
  id,
  field,
  typeId,
  value,
  secretSet,
  linkUrl,
  onChange,
}: {
  id: string;
  field: IntegrationField;
  typeId: string;
  value: string | boolean | undefined;
  secretSet: boolean;
  linkUrl: string;
  onChange: (value: string | boolean) => void;
}) {
  // A Docker container is picked from the ones running on this host.
  const containers = useQuery({
    queryKey: ["docker"],
    queryFn: fetchDocker,
    enabled: typeId === "docker" && field.key === "container",
    staleTime: 30_000,
  });
  const helpId = field.help ? `${id}-help` : undefined;

  if (field.kind === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label id={`${id}-label`} htmlFor={id} className="text-xs text-muted-foreground">
          {field.label}
        </Label>
        <Switch
          id={id}
          size="sm"
          aria-labelledby={`${id}-label`}
          aria-describedby={helpId}
          checked={value === true}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  const placeholder =
    field.kind === "secret" && secretSet
      ? "Saved; type to replace"
      : field.kind === "url"
        ? (normalizeServiceUrl(linkUrl) ?? field.placeholder)
        : field.placeholder;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {field.label}
        {field.required && field.kind !== "secret" ? " *" : ""}
      </Label>
      <Input
        id={id}
        type={field.kind === "secret" ? "password" : "text"}
        inputMode={field.kind === "url" ? "url" : undefined}
        autoComplete={field.kind === "secret" ? "new-password" : "off"}
        spellCheck={false}
        list={containers.data?.available ? `${id}-containers` : undefined}
        aria-describedby={helpId}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="font-normal"
      />
      {containers.data?.available && (
        <datalist id={`${id}-containers`}>
          {containers.data.containers.map((container) => (
            <option key={container.id} value={container.name} />
          ))}
        </datalist>
      )}
      {field.help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {field.help}
        </p>
      )}
    </div>
  );
}
