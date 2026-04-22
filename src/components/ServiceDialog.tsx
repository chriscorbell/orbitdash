import { useState, type FormEvent } from "react";
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
import {
  buildServicePayload,
  isServiceDialogSubmittable,
  useServiceDialogState,
} from "@/components/services/useServiceDialogState";
import { getValidationMessage, serviceCreateSchema } from "@shared/schemas";
import type { Service, CreateServicePayload } from "@shared/types";

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  categoryOptions: string[];
  onSubmit: (payload: CreateServicePayload, iconFile?: File, removeIcon?: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
}

type ServiceDialogBodyProps = Omit<ServiceDialogProps, "open">;

function ServiceDialogBody({
  onOpenChange,
  service,
  categoryOptions,
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
    setDescription,
    setName,
    setNewCategory,
    setOpenInNewTab,
    setSelectedCategory,
    setUrl,
  } = useServiceDialogState({
    categoryOptions,
    service,
  });

  const {
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = buildServicePayload(formState);

      const validation = serviceCreateSchema.safeParse(payload);
      if (!validation.success) {
        setErrorMessage(getValidationMessage(validation.error));
        return;
      }

      await onSubmit(validation.data, iconFile || undefined, removeIcon);
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
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Service" : "Add Service"}</DialogTitle>
        <DialogDescription>
          Add the service details, optional category, and icon source.
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
            placeholder="https://example.com"
            className="font-normal"
            required
          />
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
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
          iconUrl={iconUrl}
          iconUrlInputId={fieldIds.iconUrlInputId}
          onIconChange={handleIconChange}
          onIconUrlChange={handleIconUrlChange}
          onRemoveIcon={handleRemoveIcon}
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
  onSubmit,
  onDelete,
}: ServiceDialogProps) {
  const dialogStateKey = `${service?.id ?? "new"}:${categoryOptions.join("|")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ServiceDialogBody
          key={dialogStateKey}
          onOpenChange={onOpenChange}
          service={service}
          categoryOptions={categoryOptions}
          onSubmit={onSubmit}
          onDelete={onDelete}
        />
      ) : null}
    </Dialog>
  );
}
