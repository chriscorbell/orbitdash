import { useState, useRef, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@/shared/types";
import { getIconUrl } from "@/lib/api";
import { Upload, X } from "lucide-react";

interface ServiceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    service?: Service | null;
    onSubmit: (
        payload: CreateServicePayload | UpdateServicePayload,
        iconFile?: File,
        removeIcon?: boolean
    ) => Promise<void>;
    onDelete?: () => Promise<void>;
}

export function ServiceDialog({
    open,
    onOpenChange,
    service,
    onSubmit,
    onDelete,
}: ServiceDialogProps) {
    const isEdit = !!service;
    const [name, setName] = useState(service?.name ?? "");
    const [url, setUrl] = useState(service?.url ?? "");
    const [description, setDescription] = useState(service?.description ?? "");
    const [category, setCategory] = useState(service?.category ?? "");
    const [openInNewTab, setOpenInNewTab] = useState(service?.open_in_new_tab ?? true);
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [removeIcon, setRemoveIcon] = useState(false);
    const [iconUrl, setIconUrl] = useState("");
    const [iconPreview, setIconPreview] = useState<string | null>(
        service?.icon ? getIconUrl(service.icon, service.updated_at) : null
    );
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIconFile(file);
            setIconUrl("");
            setRemoveIcon(false);
            const reader = new FileReader();
            reader.onload = () => setIconPreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleIconUrlChange = (value: string) => {
        setIconUrl(value);
        setIconFile(null);
        setRemoveIcon(false);

        const trimmed = value.trim();
        if (trimmed) {
            setIconPreview(trimmed);
        } else {
            setIconPreview(service?.icon ? getIconUrl(service.icon, service.updated_at) : null);
        }
    };

    const handleRemoveIcon = () => {
        setIconFile(null);
        setIconPreview(null);
        setRemoveIcon(true);
        setIconUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    useEffect(() => {
        if (!open) return;

        setName(service?.name ?? "");
        setUrl(service?.url ?? "");
        setDescription(service?.description ?? "");
        setCategory(service?.category ?? "");
        setOpenInNewTab(service?.open_in_new_tab ?? true);
        setIconFile(null);
        setIconUrl("");
        setRemoveIcon(false);
        setIconPreview(service?.icon ? getIconUrl(service.icon, service.updated_at) : null);

        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [open, service?.id, service?.updated_at]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !url.trim()) return;

        setSubmitting(true);
        try {
            const payload: CreateServicePayload | UpdateServicePayload = {
                name: name.trim(),
                url: url.trim(),
                description: description.trim() || null,
                icon_url: iconUrl.trim() || null,
                category: category.trim() || null,
                open_in_new_tab: openInNewTab,
            };
            await onSubmit(payload, iconFile || undefined, removeIcon);
            onOpenChange(false);
        } catch (err) {
            console.error("Failed to save service:", err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        setDeleting(true);
        try {
            await onDelete();
            onOpenChange(false);
        } catch (err) {
            console.error("Failed to delete service:", err);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit Service" : "Add Service"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="svc-name" className="font-semibold">Name *</Label>
                        <Input
                            id="svc-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Service"
                            className="font-normal"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="svc-url" className="font-semibold">URL *</Label>
                        <Input
                            id="svc-url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="font-normal"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="svc-desc" className="font-semibold">Description</Label>
                        <Textarea
                            id="svc-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                            className="font-normal"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="svc-category" className="font-semibold">Category</Label>
                        <Input
                            id="svc-category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            placeholder="e.g. Infrastructure, Media"
                            className="font-normal"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="font-semibold">Icon (PNG/SVG)</Label>
                        <div className="flex items-center gap-3">
                            {iconPreview && (
                                <div className="relative h-10 w-10 rounded-md border border-border bg-muted">
                                    <img
                                        src={iconPreview}
                                        alt="Icon preview"
                                        className="h-full w-full object-contain p-1"
                                    />
                                    <button
                                        type="button"
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
                                onClick={() => fileInputRef.current?.click()}
                                className="font-semibold"
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                {iconPreview ? "Change" : "Upload"}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/svg+xml"
                                onChange={handleIconChange}
                                className="hidden"
                            />
                        </div>
                        <Input
                            type="url"
                            value={iconUrl}
                            onChange={(e) => handleIconUrlChange(e.target.value)}
                            placeholder="https://dashboardicons.com/..."
                            className="font-normal"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <Label htmlFor="svc-newtab" className="font-semibold">
                            Open in new tab
                        </Label>
                        <Switch
                            id="svc-newtab"
                            checked={openInNewTab}
                            onCheckedChange={setOpenInNewTab}
                        />
                    </div>

                    <DialogFooter className="flex gap-2 sm:justify-between">
                        {isEdit && onDelete && (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="mr-auto !bg-[#f7768e] font-semibold !text-black hover:!bg-[#f7768e]/90"
                            >
                                {deleting ? "Deleting…" : "Delete"}
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="font-semibold"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting || !name.trim() || !url.trim()}
                                className="font-semibold"
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
