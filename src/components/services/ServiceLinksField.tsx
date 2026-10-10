import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ServiceLinkDraft } from "@/components/services/useServiceDialogState";
import { randomId } from "@/lib/random-id";
import { LINK_LABEL_MAX_LENGTH, MAX_SERVICE_LINKS } from "@shared/service-links";
import { Plus, X } from "lucide-react";

interface ServiceLinksFieldProps {
  links: readonly ServiceLinkDraft[];
  onChange: (update: (links: ServiceLinkDraft[]) => ServiceLinkDraft[]) => void;
}

/** Up to MAX_SERVICE_LINKS named links, such as "Admin" or "Logs", listed in the card's menu. */
export function ServiceLinksField({ links, onChange }: ServiceLinksFieldProps) {
  const headingId = useId();
  // The row just added, so its label input can take focus.
  const [addedId, setAddedId] = useState<string | null>(null);

  const edit = (id: string, patch: Partial<ServiceLinkDraft>) =>
    onChange((current) => current.map((link) => (link.id === id ? { ...link, ...patch } : link)));

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm leading-none font-semibold">
          Links
        </h3>
        {links.length < MAX_SERVICE_LINKS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const id = randomId();
              setAddedId(id);
              onChange((current) => [...current, { id, label: "", url: "" }]);
            }}
          >
            <Plus aria-hidden="true" />
            Add link
          </Button>
        )}
      </div>
      {links.length > 0 && (
        <ul aria-labelledby={headingId} className="space-y-2">
          {links.map((link, index) => {
            const name = link.label.trim() || `link ${index + 1}`;
            return (
              <li
                key={link.id}
                className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none"
              >
                <Input
                  // Focus follows "Add link" to the row it made.
                  autoFocus={link.id === addedId}
                  aria-label={`Label for link ${index + 1}`}
                  autoComplete="off"
                  maxLength={LINK_LABEL_MAX_LENGTH}
                  value={link.label}
                  onChange={(event) => edit(link.id, { label: event.target.value })}
                  placeholder="Admin"
                  className="w-28 shrink-0 font-normal"
                />
                <Input
                  aria-label={`URL for link ${index + 1}`}
                  autoComplete="off"
                  spellCheck={false}
                  value={link.url}
                  onChange={(event) => edit(link.id, { url: event.target.value })}
                  placeholder="https://example.com/admin"
                  className="min-w-0 flex-1 font-normal"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-9"
                  onClick={() => onChange((current) => current.filter(({ id }) => id !== link.id))}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
