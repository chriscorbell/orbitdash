import { Toast } from "radix-ui";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismissToast, useToasts, type ToastItem } from "@/lib/toast";

function ToastIcon({ tone }: { tone: ToastItem["tone"] }) {
  if (tone === "success") {
    return <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (tone === "error") {
    return <CircleAlert aria-hidden="true" className="text-destructive mt-0.5 h-4 w-4 shrink-0" />;
  }
  return null;
}

/** Renders queued toasts in the bottom-right corner, newest at the bottom. */
export function Toaster() {
  const toasts = useToasts();

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((item) => (
        <Toast.Root
          key={item.id}
          duration={item.durationMs}
          type={item.tone === "error" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id);
          }}
          className={cn(
            "group pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border bg-popover p-3.5 pr-9 text-popover-foreground shadow-lg ring-1 ring-foreground/5",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-8 data-[state=closed]:duration-200",
            "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full",
            "motion-reduce:animate-none"
          )}
        >
          <ToastIcon tone={item.tone} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <Toast.Title className="text-sm font-medium leading-snug">{item.title}</Toast.Title>
            {item.description && (
              <Toast.Description className="text-muted-foreground text-sm leading-snug">
                {item.description}
              </Toast.Description>
            )}
          </div>
          {item.action && (
            <Toast.Action
              altText={item.action.label}
              onClick={item.action.onClick}
              className="hover:bg-accent focus-visible:ring-ring shrink-0 self-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              {item.action.label}
            </Toast.Action>
          )}
          <Toast.Close
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed right-0 bottom-0 z-[100] flex max-h-svh w-full flex-col gap-2 p-4 outline-none sm:max-w-sm" />
    </Toast.Provider>
  );
}
