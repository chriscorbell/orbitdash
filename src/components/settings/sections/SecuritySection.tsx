import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SettingsAccount } from "@/components/settings/settings-sections";

/** Who is signed in, or that sign-in is off and how to turn it on. */
export function SecuritySection({ account }: { account?: SettingsAccount }) {
  if (!account) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Sign-in is off</p>
          <p className="text-muted-foreground text-sm">
            Anyone who can open the dashboard can change it. Set <code>ORBITDASH_AUTH</code> to{" "}
            <code>password</code> or <code>proxy</code> to require a sign-in, optionally with
            view-only guests. The README explains each mode.
          </p>
        </div>
      </div>
    );
  }

  const viaProxy = account.mode === "proxy";
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">
          {viaProxy ? (account.user ?? "Signed in") : "Signed in"}
        </p>
        <p className="text-muted-foreground text-sm">
          {viaProxy ? "Through your sign-in proxy" : "With the dashboard password"}
        </p>
      </div>
      {!viaProxy && account.onSignOut && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={account.onSignOut}
        >
          <LogOut />
          Sign out
        </Button>
      )}
    </div>
  );
}
