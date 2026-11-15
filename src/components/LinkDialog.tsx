import { ChevronDown, ImageOff, LoaderCircle, Search, Upload } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Board, Category, IconMatch, Link } from "../../shared/types.ts";
import { api, linkIconSrc } from "../api.ts";
import { Dialog } from "./Dialog.tsx";
import { useIconTone } from "../useIconTone.ts";
import { LinkIcon } from "./LinkIcon.tsx";

type IconChoice =
  | { kind: "keep" }
  | { kind: "none" }
  | { kind: "file"; file: File; preview: string }
  | { kind: "library"; match: IconMatch };

interface LinkDialogProps {
  /** null adds a new link. */
  link: Link | null;
  /** Category name a new link starts in. */
  category?: string;
  categories: Category[];
  onSaved: (board: Board) => void;
  onClose: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Icon library matches for a query, fetched a moment after typing stops. */
function useIconSearch(query: string) {
  const trimmed = query.trim();
  const [result, setResult] = useState<{ query: string; matches: IconMatch[]; failed: boolean }>({
    query: "",
    matches: [],
    failed: false,
  });

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.searchIcons(trimmed, controller.signal).then(
        (matches) => setResult({ query: trimmed, matches, failed: false }),
        () => {
          if (!controller.signal.aborted) setResult({ query: trimmed, matches: [], failed: true });
        }
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const active = trimmed.length >= 2;
  return {
    matches: active ? result.matches : [],
    loading: active && result.query !== trimmed,
    failed: active && result.query === trimmed && result.failed,
  };
}

/** One icon library result, drawn the way the board will draw it. */
function IconOption({
  match,
  selected,
  onSelect,
}: {
  match: IconMatch;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = useIconTone(match.url);
  return (
    <button
      type="button"
      className="icon-option"
      data-tone={tone}
      title={`${match.name} (${match.source === "selfhst" ? "selfh.st" : "dashboard-icons"})`}
      aria-label={match.name}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <img src={match.url} alt="" loading="lazy" />
    </button>
  );
}

export function LinkDialog({ link, category, categories, onSaved, onClose }: LinkDialogProps) {
  const [url, setUrl] = useState(link?.url ?? "");
  const [name, setName] = useState(link?.name ?? "");
  const [categoryName, setCategoryName] = useState(
    link ? (categories.find((item) => item.id === link.categoryId)?.name ?? "") : (category ?? "")
  );
  const [newTab, setNewTab] = useState(link?.newTab ?? true);
  const [icon, setIcon] = useState<IconChoice>({ kind: link?.icon ? "keep" : "none" });
  // The icon search follows the name until it's edited.
  const [iconQuery, setIconQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const categoryInput = useRef<HTMLInputElement>(null);
  const search = useIconSearch(iconQuery ?? name);

  useEffect(() => {
    if (icon.kind !== "file") return;
    return () => URL.revokeObjectURL(icon.preview);
  }, [icon]);

  const preview =
    icon.kind === "keep" && link
      ? linkIconSrc(link)
      : icon.kind === "file"
        ? icon.preview
        : icon.kind === "library"
          ? icon.match.url
          : null;
  const categoryListId = "link-dialog-categories";

  return (
    <Dialog title={link ? "Edit link" : "New link"} onClose={onClose} wide>
      {(close) => {
        async function run(action: () => Promise<Board>) {
          setBusy(true);
          setError(null);
          try {
            onSaved(await action());
            close();
          } catch (caught) {
            setError(message(caught));
            setBusy(false);
          }
        }

        function submit(event: FormEvent) {
          event.preventDefault();
          const form = new FormData();
          form.set("url", url);
          form.set("name", name);
          form.set("category", categoryName);
          form.set("newTab", String(newTab));
          if (icon.kind === "file") form.set("iconFile", icon.file);
          if (icon.kind === "library") form.set("iconUrl", icon.match.url);
          if (icon.kind === "none" && link?.icon) form.set("removeIcon", "true");
          void run(() => (link ? api.updateLink(link.id, form) : api.createLink(form)));
        }

        return (
          <form onSubmit={submit} className="link-form">
            <label className="field">
              <span className="field-label">URL</span>
              <input
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://"
                required
                autoFocus={!link}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <span className="picker">
                  <input
                    ref={categoryInput}
                    className="input"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    list={categoryListId}
                    maxLength={100}
                    placeholder="None"
                  />
                  <button
                    type="button"
                    className="picker-toggle"
                    tabIndex={-1}
                    aria-label="Show categories"
                    onClick={() => {
                      const input = categoryInput.current;
                      if (!input) return;
                      input.focus();
                      try {
                        input.showPicker();
                      } catch {
                        // Browsers without showPicker for datalists still list them on typing.
                      }
                    }}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                </span>
                <datalist id={categoryListId}>
                  {categories.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </label>
            </div>

            <fieldset className="field icon-field">
              <legend className="field-label">Icon</legend>
              <div className="icon-current">
                <LinkIcon src={preview} large />
                <button type="button" className="button" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden="true" />
                  Upload
                </button>
                <button
                  type="button"
                  className="button"
                  data-variant="ghost"
                  disabled={preview === null}
                  onClick={() => setIcon({ kind: "none" })}
                >
                  <ImageOff aria-hidden="true" />
                  Remove
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/gif,image/webp,image/x-icon,.ico"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setIcon({ kind: "file", file, preview: URL.createObjectURL(file) });
                    event.target.value = "";
                  }}
                />
              </div>
              <div className="icon-search">
                <Search aria-hidden="true" />
                <input
                  className="input"
                  type="search"
                  aria-label="Search the icon libraries"
                  placeholder="Search icons"
                  value={iconQuery ?? name}
                  onChange={(event) => setIconQuery(event.target.value)}
                />
                {search.loading && <LoaderCircle className="spinner" aria-hidden="true" />}
              </div>
              {search.failed ? (
                <p className="field-hint">The icon libraries can't be reached right now.</p>
              ) : (
                search.matches.length > 0 && (
                  <ul className="icon-results" data-stale={search.loading || undefined}>
                    {search.matches.map((match) => (
                      <li key={match.id}>
                        <IconOption
                          match={match}
                          selected={icon.kind === "library" && icon.match.id === match.id}
                          onSelect={() => setIcon({ kind: "library", match })}
                        />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </fieldset>

            <label className="switch-field">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={newTab}
                onChange={(event) => setNewTab(event.target.checked)}
              />
              Open in a new tab
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="dialog-footer">
              {link &&
                (confirmingDelete ? (
                  <button
                    type="button"
                    className="button"
                    data-variant="danger"
                    data-push=""
                    disabled={busy}
                    onClick={() => void run(() => api.deleteLink(link.id))}
                  >
                    Delete {link.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    data-variant="ghost"
                    data-danger=""
                    data-push=""
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </button>
                ))}
              <button type="button" className="button" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="button" data-variant="primary" disabled={busy}>
                {link ? "Save" : "Add link"}
              </button>
            </div>
          </form>
        );
      }}
    </Dialog>
  );
}
