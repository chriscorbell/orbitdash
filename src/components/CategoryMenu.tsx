import { ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";

interface CategoryMenuProps {
  name: string;
  first: boolean;
  last: boolean;
  onRename: () => void;
  onMove: (offset: number) => void;
  onDelete: () => void;
}

const GAP = 6;
const EDGE = 8;

/** A category's less frequent actions, in a popover menu under a "more" button. */
export function CategoryMenu({ name, first, last, onRename, onMove, onDelete }: CategoryMenuProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!menu || !button) return;

    const close = () => menu.hidePopover();

    // Placed under the button, right edges aligned, before it shows; flipped above if it would
    // run off the bottom once its height is known.
    function place(event: Event) {
      if ((event as ToggleEvent).newState !== "open") return;
      const rect = button!.getBoundingClientRect();
      const width = menu!.offsetWidth || 188;
      menu!.style.left = `${Math.max(EDGE, Math.min(rect.right - width, innerWidth - width - EDGE))}px`;
      menu!.style.top = `${rect.bottom + GAP}px`;
    }

    function opened(event: Event) {
      if ((event as ToggleEvent).newState !== "open") {
        removeEventListener("scroll", close, true);
        removeEventListener("resize", close);
        return;
      }
      const rect = button!.getBoundingClientRect();
      if (rect.bottom + GAP + menu!.offsetHeight > innerHeight - EDGE) {
        menu!.style.top = `${Math.max(EDGE, rect.top - GAP - menu!.offsetHeight)}px`;
      }
      menu!.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
      addEventListener("scroll", close, true);
      addEventListener("resize", close);
    }

    menu.addEventListener("beforetoggle", place);
    menu.addEventListener("toggle", opened);
    return () => {
      menu.removeEventListener("beforetoggle", place);
      menu.removeEventListener("toggle", opened);
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, []);

  function run(action: () => void) {
    menuRef.current?.hidePopover();
    action();
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? items[(index + 1) % items.length]
        : event.key === "ArrowUp"
          ? items[(index - 1 + items.length) % items.length]
          : event.key === "Home"
            ? items[0]
            : event.key === "End"
              ? items[items.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button"
        data-variant="ghost"
        data-icon-only=""
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        title="More"
        popoverTarget={menuId}
      >
        <Ellipsis />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={`Actions for ${name}`}
        className="menu"
        onKeyDown={moveFocus}
      >
        <button type="button" role="menuitem" className="menu-item" onClick={() => run(onRename)}>
          <Pencil aria-hidden="true" />
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={first}
          onClick={() => run(() => onMove(-1))}
        >
          <ArrowUp aria-hidden="true" />
          Move earlier
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={last}
          onClick={() => run(() => onMove(1))}
        >
          <ArrowDown aria-hidden="true" />
          Move later
        </button>
        <div role="separator" className="menu-separator" />
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          data-danger=""
          onClick={() => run(onDelete)}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </button>
      </div>
    </>
  );
}
