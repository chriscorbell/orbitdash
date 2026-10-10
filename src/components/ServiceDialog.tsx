import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ServiceCategoryField } from "@/components/services/ServiceCategoryField";
import { ServiceDialogActions } from "@/components/services/ServiceDialogActions";
import { ServiceIconField } from "@/components/services/ServiceIconField";
import { ServiceStatusCheckField } from "@/components/services/ServiceStatusCheckField";
import { ServiceUrlAssist } from "@/components/services/ServiceUrlAssist";
import { inspectServiceUrl } from "@/lib/api/service-tools";
import { normalizeServiceUrl } from "@shared/urls";
import {
  isServiceDialogSubmittable,
  prepareServicePayload,
  useServiceDialogState,
} from "@/components/services/useServiceDialogState";
import type { Service, CreateServicePayload } from "@shared/types";

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  categoryOptions: string[];
  /** Category picked up front when adding, e.g. from a category's add tile. */
  defaultCategory?: string | null;
  onSubmit: (payload: CreateServicePayload, iconFile?: File, removeIcon?: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
}

type ServiceDialogBodyProps = Omit<ServiceDialogProps, "open">;

function ServiceDialogBody({
  onOpenChange,
  service,
  categoryOptions,
  defaultCategory,
  onSubmit,
  onDelete,
}: ServiceDialogBodyProps) {
  const isEdit = !!service;
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    fieldIds,
    fileInputRef,
    formState,
    iconFile,
    handleIconChange,
    handleIconUrlChange,
    handleRemoveIcon,
    setCheck,
    setDescription,
    setName,
    setNewCategory,
    setOpenInNewTab,
    setSelectedCategory,
    setUrl,
    storedIconSourceUrl,
    suggestName,
  } = useServiceDialogState({
    categoryOptions,
    defaultCategory,
    service,
  });

  const {
    checkEnabled,
    checkIgnoreTls,
    checkInterval,
    checkMethod,
    checkTarget,
    description,
    iconPreview,
    iconUrl,
    name,
    newCategory,
    openInNewTab,
    removeIcon,
    selectedCategory,
    url,
  } = formState;
  const canSubmit = isServiceDialogSubmittable(formState);

  // Reading a new link's page fills in an empty name and offers the site's icon.
  const inspection = useMutation({ mutationFn: inspectServiceUrl });
  const [inspectedUrl, setInspectedUrl] = useState(() =>
    service ? normalizeServiceUrl(service.url) : null
  );
  const inspect = (value: string) => {
    const normalized = normalizeServiceUrl(value);
    if (!normalized || normalized === inspectedUrl) return;
    setInspectedUrl(normalized);
    inspection.mutate(normalized, {
      onSuccess: (result) => {
        if (result.name) suggestName(result.name);
      },
    });
  };
  const normalizedUrl = normalizeServiceUrl(url);
  const pageInfo = inspection.data?.url === normalizedUrl ? inspection.data : null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const prepared = prepareServicePayload(formState);
      if (prepared.error !== null) {
        setErrorMessage(prepared.error);
        return;
      }

      await onSubmit(prepared.payload, iconFile || undefined, removeIcon);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save service");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete service");
    } finally {
      setDeleting(false);
    }
  };

  return (
    // Scrolls like the settings dialog once the status check section makes it taller than the screen.
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Service" : "Add Service"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Change the service's details, category and icon."
            : "Paste a link to fill in the name and suggest an icon."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={fieldIds.nameInputId} className="font-semibold">
            Name *
          </Label>
          <Input
            id={fieldIds.nameInputId}
            name="name"
            autoComplete="organization"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My Service"
            className="font-normal"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldIds.urlInputId} className="font-semibold">
            URL *
          </Label>
          <Input
            id={fieldIds.urlInputId}
            name="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={(event) => inspect(event.target.value)}
            onPaste={(event) => {
              if (!url.trim()) inspect(event.clipboardData.getData("text/plain"));
            }}
            placeholder="https://example.com"
            className="font-normal"
            required
          />
          <div className="flex items-start justify-between gap-3">
            <ServiceUrlAssist
              url={url}
              check={{
                check_method: checkMethod,
                check_target: checkTarget.trim() || null,
                check_ignore_tls: checkIgnoreTls,
              }}
              inspecting={inspection.isPending && inspection.variables === normalizedUrl}
              inspection={pageInfo}
            />
            <div className="flex shrink-0 items-center gap-2 pt-1.5">
              <Label
                id={`${fieldIds.newTabInputId}-label`}
                htmlFor={fieldIds.newTabInputId}
                className="text-xs text-muted-foreground"
              >
                Open in new tab
              </Label>
              <Switch
                id={fieldIds.newTabInputId}
                aria-labelledby={`${fieldIds.newTabInputId}-label`}
                checked={openInNewTab}
                size="sm"
                onCheckedChange={setOpenInNewTab}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldIds.descriptionInputId} className="font-semibold">
            Description
          </Label>
          <Textarea
            id={fieldIds.descriptionInputId}
            name="description"
            autoComplete="off"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description"
            className="font-normal"
            rows={2}
          />
        </div>

        <ServiceCategoryField
          categoryInputId={fieldIds.categoryInputId}
          categoryOptions={categoryOptions}
          newCategory={newCategory}
          newCategoryInputId={fieldIds.newCategoryInputId}
          onNewCategoryChange={setNewCategory}
          onSelectedCategoryChange={setSelectedCategory}
          selectedCategory={selectedCategory}
        />

        <ServiceIconField
          fileInputId={fieldIds.iconFileInputId}
          fileInputRef={fileInputRef}
          iconPreview={iconPreview}
          iconSourceUrl={storedIconSourceUrl}
          iconUrl={iconUrl}
          iconUrlInputId={fieldIds.iconUrlInputId}
          onIconChange={handleIconChange}
          onIconUrlChange={handleIconUrlChange}
          onRemoveIcon={handleRemoveIcon}
          serviceName={name}
          siteIconUrl={pageInfo?.iconUrl ?? null}
        />

        <ServiceStatusCheckField
          fieldIds={fieldIds}
          linkUrl={url}
          onChange={setCheck}
          value={{ checkEnabled, checkIgnoreTls, checkInterval, checkMethod, checkTarget }}
        />

        {errorMessage && <p className="text-sm font-medium text-destructive">{errorMessage}</p>}

        <ServiceDialogActions
          canSubmit={canSubmit}
          deleting={deleting}
          isEdit={isEdit}
          onCancel={() => onOpenChange(false)}
          onDelete={onDelete ? handleDelete : undefined}
          submitting={submitting}
        />
      </form>
    </DialogContent>
  );
}

export function ServiceDialog({
  open,
  onOpenChange,
  service,
  categoryOptions,
  defaultCategory,
  onSubmit,
  onDelete,
}: ServiceDialogProps) {
  const dialogStateKey = `${service?.id ?? "new"}:${defaultCategory ?? ""}:${categoryOptions.join("|")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ServiceDialogBody
          key={dialogStateKey}
          onOpenChange={onOpenChange}
          service={service}
          categoryOptions={categoryOptions}
          defaultCategory={defaultCategory}
          onSubmit={onSubmit}
          onDelete={onDelete}
        />
      ) : null}
    </Dialog>
  );
}
