import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SERVICE_TAGS, normalizeTag, TAG_MAX_LENGTH } from "@shared/tags";
import { X } from "lucide-react";

interface ServiceTagsFieldProps {
  draft: string;
  inputId: string;
  /** Tags other services use, offered while typing. */
  suggestions: readonly string[];
  tags: readonly string[];
  onChange: (patch: { tagDraft?: string; tags?: string[] }) => void;
}

/**
 * Tags as chips under a plain input: Enter or a comma adds what was typed, Backspace in the empty
 * input removes the last one, and picking a suggestion adds it at once.
 */
export function ServiceTagsField({
  draft,
  inputId,
  suggestions,
  tags,
  onChange,
}: ServiceTagsFieldProps) {
  const [announcement, setAnnouncement] = useState("");
  const listId = `${inputId}-suggestions`;
  const full = tags.length >= MAX_SERVICE_TAGS;
  const offered = suggestions.filter((tag) => !tags.includes(tag));

  /** Adds each new tag in `values` (up to the limit) and leaves `rest` in the input. */
  const add = (values: string[], rest = "") => {
    const next = [...tags];
    for (const tag of values.map(normalizeTag)) {
      if (tag && !next.includes(tag) && next.length < MAX_SERVICE_TAGS) next.push(tag);
    }
    const added = next.slice(tags.length);
    if (added.length > 0) setAnnouncement(`Added ${added.join(", ")}`);
    onChange({ tags: next, tagDraft: rest });
  };

  const remove = (tag: string) => {
    setAnnouncement(`Removed ${tag}`);
    onChange({ tags: tags.filter((entry) => entry !== tag) });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    const native = event.nativeEvent;
    // Choosing from the suggestion list replaces the text in one go (Firefox sends a plain event).
    const picked =
      offered.includes(value) &&
      (!(native instanceof InputEvent) || native.inputType === "insertReplacementText");
    if (picked) {
      add([value]);
    } else if (value.includes(",")) {
      const parts = value.split(",");
      add(parts.slice(0, -1), parts[parts.length - 1]);
    } else {
      onChange({ tagDraft: value });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && draft.trim()) {
      // Adds the tag instead of submitting the form; Enter in an empty input still saves.
      event.preventDefault();
      add([draft]);
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="font-semibold">
        Tags
      </Label>
      <Input
        id={inputId}
        name="tags"
        autoComplete="off"
        list={offered.length > 0 ? listId : undefined}
        maxLength={TAG_MAX_LENGTH}
        disabled={full}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) add([draft]);
        }}
        placeholder={full ? `Up to ${MAX_SERVICE_TAGS} tags` : "Add a tag"}
        className="font-normal"
      />
      {offered.length > 0 && (
        <datalist id={listId}>
          {offered.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      )}
      {tags.length > 0 && (
        <ul aria-label="Current tags" className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex h-6 items-center gap-0.5 rounded-full bg-secondary p-0.5 pl-2.5 text-xs font-medium text-secondary-foreground animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => remove(tag)}
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
