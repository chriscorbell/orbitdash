import { useEffect, useRef } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Opens the command palette with ⌘K or Ctrl+K, with `/`, or by simply starting to type a letter
 * or number anywhere outside a field (that first character becomes the query). Nothing happens
 * while another dialog is open.
 */
export function usePaletteShortcuts(
  onOpen: (query: string) => void,
  { typeToSearch }: { typeToSearch: boolean }
) {
  const latest = useRef({ onOpen, typeToSearch });
  useEffect(() => {
    latest.current = { onOpen, typeToSearch };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (document.querySelector('[role="dialog"]')) return;

      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        latest.current.onOpen("");
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        latest.current.onOpen("");
      } else if (
        latest.current.typeToSearch &&
        event.key.length === 1 &&
        /[\p{L}\p{N}]/u.test(event.key)
      ) {
        event.preventDefault();
        latest.current.onOpen(event.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
