import { useSyncExternalStore, type MouseEvent } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** Goes to a page of the app without reloading it. */
export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  listeners.forEach((listener) => listener());
  window.scrollTo({ top: 0 });
}

/** The current path; components re-render when it changes. */
export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/"
  );
}

/** Click handler for in-app links that keeps new-tab and modified clicks working normally. */
export function handleLinkClick(event: MouseEvent<HTMLAnchorElement>, path: string) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  navigate(path);
}
