import {
    useEffect,
    useId,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type RefObject,
} from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getIconUrl } from "@/lib/api/services";
import { cn } from "@/lib/utils";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";
import { Upload, X } from "lucide-react";

const NEW_CATEGORY_VALUE = "__new__";
const NONE_CATEGORY_VALUE = "__none__";

interface ServiceDialogFormState {
    description: string;
    iconPreview: string | null;
    iconUrl: string;
    name: string;
    newCategory: string;
    openInNewTab: boolean;
    removeIcon: boolean;
    selectedCategory: string;
    url: string;
}

interface ServiceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    service?: Service | null;
    categoryOptions: string[];
    onSubmit: (
        payload: CreateServicePayload | UpdateServicePayload,
        iconFile?: File,
        removeIcon?: boolean
    ) => Promise<void>;
    onDelete?: () => Promise<void>;
}

function getServiceIconPreview(service?: Service | null) {
    return service?.icon ? getIconUrl(service.icon, service.updated_at) : null;
}

function resolveInitialCategoryState(service: Service | null | undefined, categoryOptions: string[]) {
    const initialCategory = service?.category?.trim() ?? "";

    if (!initialCategory) {
        return {
            newCategory: "",
            selectedCategory: NONE_CATEGORY_VALUE,
        };
    }

    if (categoryOptions.includes(initialCategory)) {
        return {
            newCategory: "",
            selectedCategory: initialCategory,
        };
    }

    return {
        newCategory: initialCategory,
        selectedCategory: NEW_CATEGORY_VALUE,
    };
}

function createInitialFormState(
    service: Service | null | undefined,
    categoryOptions: string[]
): ServiceDialogFormState {
    const categoryState = resolveInitialCategoryState(service, categoryOptions);

    return {
        description: service?.description ?? "",
        iconPreview: getServiceIconPreview(service),
        iconUrl: "",
        name: service?.name ?? "",
        newCategory: categoryState.newCategory,
        openInNewTab: service?.open_in_new_tab ?? true,
        removeIcon: false,
        selectedCategory: categoryState.selectedCategory,
        url: service?.url ?? "",
    };
}

function resetFileInput(fileInputRef: RefObject<HTMLInputElement | null>) {
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
}

export function ServiceDialog({
    open,
    onOpenChange,
    service,
    categoryOptions,
    onSubmit,
    onDelete,
}: ServiceDialogProps) {
    const isEdit = !!service;
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fieldIdPrefix = useId();
    const [formState, setFormState] = useState<ServiceDialogFormState>(() =>
        createInitialFormState(service, categoryOptions)
    );

    const nameInputId = `${fieldIdPrefix}-name`;
    const urlInputId = `${fieldIdPrefix}-url`;
    const newTabInputId = `${fieldIdPrefix}-new-tab`;
    const descriptionInputId = `${fieldIdPrefix}-description`;
    const categoryInputId = `${fieldIdPrefix}-category`;
    const newCategoryInputId = `${fieldIdPrefix}-new-category`;
    const iconFileInputId = `${fieldIdPrefix}-icon-file`;
    const iconUrlInputId = `${fieldIdPrefix}-icon-url`;

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

    const handleIconChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIconFile(file);
            setFormState((current) => ({
                ...current,
                iconPreview: null,
                iconUrl: "",
                removeIcon: false,
            }));
            const reader = new FileReader();
            reader.onload = () =>
                setFormState((current) => ({
                    ...current,
                    iconPreview: reader.result as string,
                }));
            reader.readAsDataURL(file);
        }
    };

    const handleIconUrlChange = (value: string) => {
        setIconFile(null);
        setFormState((current) => {
            const trimmed = value.trim();
            return {
                ...current,
                iconPreview: trimmed || getServiceIconPreview(service),
                iconUrl: value,
                removeIcon: false,
            };
        });
    };

    const handleRemoveIcon = () => {
        setIconFile(null);
        setFormState((current) => ({
            ...current,
            iconPreview: null,
            iconUrl: "",
            removeIcon: true,
        }));
        resetFileInput(fileInputRef);
    };

    useEffect(() => {
        if (!open) return;

        setFormState(createInitialFormState(service, categoryOptions));
        setIconFile(null);
        setErrorMessage(null);
        resetFileInput(fileInputRef);
    }, [open, service, categoryOptions]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;

        const resolvedCategory =
            selectedCategory === NEW_CATEGORY_VALUE
                ? newCategory.trim()
                : selectedCategory === NONE_CATEGORY_VALUE
                    ? ""
                    : selectedCategory.trim();

        if (selectedCategory === NEW_CATEGORY_VALUE && !resolvedCategory) return;

        setSubmitting(true);
        setErrorMessage(null);
        try {
            const payload: CreateServicePayload | UpdateServicePayload = {
                name: name.trim(),
                url: url.trim(),
                description: description.trim() || null,
                icon_url: iconUrl.trim() || null,
                category: resolvedCategory || null,
                open_in_new_tab: openInNewTab,
            };
            await onSubmit(payload, iconFile || undefined, removeIcon);
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit Service" : "Add Service"}</DialogTitle>
                    <DialogDescription>
                        Add the service details, optional category, and icon source.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={nameInputId} className="font-semibold">Name *</Label>
                        <Input
                            id={nameInputId}
                            name="name"
                            autoComplete="organization"
                            value={name}
                            onChange={(e) =>
                                setFormState((current) => ({
                                    ...current,
                                    name: e.target.value,
                                }))
                            }
                            placeholder="My Service"
                            className="font-normal"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={urlInputId} className="font-semibold">URL *</Label>
                        <Input
                            id={urlInputId}
                            name="url"
                            autoComplete="url"
                            value={url}
                            onChange={(e) =>
                                setFormState((current) => ({
                                    ...current,
                                    url: e.target.value,
                                }))
                            }
                            placeholder="https://example.com"
                            className="font-normal"
                            required
                        />
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Use a full `http://` or `https://` address.
                            </p>
                            <div className="flex items-center gap-2">
                                <Label id={`${newTabInputId}-label`} className="text-xs text-muted-foreground">
                                    Open in new tab
                                </Label>
                                <button
                                    id={newTabInputId}
                                    type="button"
                                    role="switch"
                                    aria-checked={openInNewTab}
                                    aria-labelledby={`${newTabInputId}-label`}
                                    className={cn(
                                        "inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border border-transparent outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                                        openInNewTab
                                            ? "bg-primary"
                                            : "bg-input dark:bg-input/80"
                                    )}
                                    onClick={() =>
                                        setFormState((current) => ({
                                            ...current,
                                            openInNewTab: !current.openInNewTab,
                                        }))
                                    }
                                >
                                    <span
                                        className={cn(
                                            "pointer-events-none block size-3 rounded-full bg-background transition-transform",
                                            openInNewTab
                                                ? "translate-x-[calc(100%-2px)]"
                                                : "translate-x-0"
                                        )}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={descriptionInputId} className="font-semibold">Description</Label>
                        <Textarea
                            id={descriptionInputId}
                            name="description"
                            autoComplete="off"
                            value={description}
                            onChange={(e) =>
                                setFormState((current) => ({
                                    ...current,
                                    description: e.target.value,
                                }))
                            }
                            placeholder="Optional description"
                            className="font-normal"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label id={`${categoryInputId}-label`} htmlFor={categoryInputId} className="font-semibold">Category</Label>
                        <Select
                            value={selectedCategory}
                            onValueChange={(value) =>
                                setFormState((current) => ({
                                    ...current,
                                    selectedCategory: value,
                                }))
                            }
                        >
                            <SelectTrigger
                                id={categoryInputId}
                                name="category"
                                aria-label="Category"
                                aria-labelledby={`${categoryInputId}-label`}
                                className="w-full font-normal"
                            >
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_CATEGORY_VALUE}>Uncategorized</SelectItem>
                                {categoryOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                                <SelectItem value={NEW_CATEGORY_VALUE}>New category…</SelectItem>
                            </SelectContent>
                        </Select>
                        {selectedCategory === NEW_CATEGORY_VALUE && (
                            <>
                                <Label htmlFor={newCategoryInputId} className="sr-only">
                                    New category name
                                </Label>
                                <Input
                                    id={newCategoryInputId}
                                    name="newCategory"
                                    autoComplete="off"
                                    value={newCategory}
                                    onChange={(e) =>
                                        setFormState((current) => ({
                                            ...current,
                                            newCategory: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Infrastructure, Media"
                                    className="font-normal"
                                    required
                                />
                            </>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="font-semibold">Icon (PNG/SVG)</Label>
                        <div className="flex flex-wrap items-center gap-3">
                            {iconPreview && (
                                <div className="relative h-10 w-10 rounded-md border border-border bg-muted">
                                    <img
                                        src={iconPreview}
                                        alt="Icon preview"
                                        className="h-full w-full object-contain p-1"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Remove icon"
                                        onClick={handleRemoveIcon}
                                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white hover:bg-destructive/80"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label="Upload icon"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                {iconPreview ? "Change" : "Upload"}
                            </Button>
                            <Label htmlFor={iconFileInputId} className="sr-only">
                                Upload icon file
                            </Label>
                            <input
                                id={iconFileInputId}
                                name="iconFile"
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/svg+xml"
                                onChange={handleIconChange}
                                aria-label="Upload icon file"
                                autoComplete="off"
                                className="hidden"
                            />
                            <Label htmlFor={iconUrlInputId} className="sr-only">
                                Icon URL
                            </Label>
                            <Input
                                id={iconUrlInputId}
                                name="iconUrl"
                                type="url"
                                autoComplete="url"
                                value={iconUrl}
                                onChange={(e) => handleIconUrlChange(e.target.value)}
                                placeholder="https://example.com/icon.png"
                                className="min-w-48 flex-1 font-normal"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Enter a direct `http://` or `https://` URL to a PNG or SVG icon.
                        </p>
                    </div>

                    {errorMessage && (
                        <p className="text-sm font-medium text-destructive">
                            {errorMessage}
                        </p>
                    )}

                    <DialogFooter className="flex gap-2 sm:justify-between">
                        {isEdit && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="mr-auto"
                            >
                                {deleting ? "Deleting…" : "Delete"}
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    submitting ||
                                    !name.trim() ||
                                    !url.trim() ||
                                    (selectedCategory === NEW_CATEGORY_VALUE && !newCategory.trim())
                                }
                            >
                                {submitting ? "Saving…" : isEdit ? "Save changes" : "Add service"}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
