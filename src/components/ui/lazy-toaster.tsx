import { lazy, Suspense, useEffect, useState } from "react";
import { useToasts } from "@/lib/toast";

const loadToaster = () => import("@/components/ui/toaster");
const Toaster = lazy(() => loadToaster().then((module) => ({ default: module.Toaster })));

/**
 * Toasts only follow an action, so the toaster (and Radix Toast) stays out of the first paint. It
 * downloads once the page is idle, mounts with the first toast, and then stays mounted so later
 * toasts animate out properly.
 */
export function LazyToaster() {
  const hasToasts = useToasts().length > 0;
  const [mounted, setMounted] = useState(false);
  if (hasToasts && !mounted) setMounted(true);

  useEffect(() => {
    const timer = setTimeout(() => void loadToaster(), 2500);
    return () => clearTimeout(timer);
  }, []);

  return mounted || hasToasts ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null;
}
