import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CircleAlert, Eye, EyeOff, LoaderCircle, LogIn, RotateCw } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AuthMode, AuthSession } from "@shared/auth";

interface SignInScreenProps {
  mode: AuthMode;
  /** Shown when guests can view the dashboard, to go back to it without signing in. */
  onCancel?: () => void;
  onSignedIn: (session: AuthSession) => void;
}

function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Lock {
  /** When the lock was set; the clock below may not have ticked since. */
  setAt: number;
  until: number;
}

/** Milliseconds left on the lock, ticking once a second; null once it has passed. */
function useCountdown(lock: Lock | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lock === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lock.until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [lock]);

  if (lock === null) return null;
  const left = lock.until - Math.max(now, lock.setAt);
  return left > 0 ? left : null;
}

/** A short head shake for a rejected password; skipped when reduced motion is preferred. */
function shake(element: HTMLElement | null) {
  if (!element || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  element.animate?.(
    [0, -6, 5, -3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 320, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" }
  );
}

function PasswordForm({ onSignedIn }: Pick<SignInScreenProps, "onSignedIn">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const wait = useCountdown(lock);
  const locked = wait !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || locked || password === "") return;

    setPending(true);
    setError(null);
    try {
      onSignedIn(await signIn(password));
    } catch (caught) {
      setPending(false);
      shake(fieldRef.current);
      if (caught instanceof ApiError && caught.status === 429) {
        const setAt = Date.now();
        setLock({ setAt, until: setAt + (caught.retryAfterSeconds ?? 60) * 1000 });
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError("Incorrect password.");
        setPassword("");
      } else {
        setError("Couldn't sign in. Try again.");
      }
      inputRef.current?.focus();
    }
  };

  const message = locked ? `Too many attempts. Try again in ${formatWait(wait)}.` : error;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* Lets password managers file the saved password under this dashboard. */}
      <input
        type="text"
        name="username"
        aria-label="Username"
        autoComplete="username"
        value="orbitdash"
        readOnly
        hidden
      />
      <div className="space-y-2">
        <Label htmlFor="sign-in-password">Password</Label>
        <div ref={fieldRef} className="relative">
          <Input
            ref={inputRef}
            id="sign-in-password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "sign-in-message" : undefined}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 pr-10"
          />
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {/* Always there, so a message doesn't push the form around and is announced. */}
        <p id="sign-in-message" role="alert" className="min-h-5 text-sm text-destructive">
          {message && (
            <span className="flex animate-in items-center gap-1.5 fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              <span className="tabular-nums">{message}</span>
            </span>
          )}
        </p>
      </div>
      <Button
        type="submit"
        className="h-10 w-full active:scale-[0.98]"
        disabled={pending || locked || password === ""}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <LogIn aria-hidden="true" />
        )}
        Sign in
      </Button>
    </form>
  );
}

/** Full-page sign-in: the password form, or in proxy mode a note that the proxy sent no user. */
export function SignInScreen({ mode, onCancel, onSignedIn }: SignInScreenProps) {
  const name = document.title.trim() || "orbitdash";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <main className="page-load w-full max-w-xs">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo className="size-11 text-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "proxy" ? "Not signed in" : name}
          </h1>
        </div>

        {mode === "proxy" ? (
          <div className="space-y-6 text-center">
            <p className="text-sm text-muted-foreground">
              Open this dashboard through your sign-in proxy.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full"
              onClick={() => window.location.reload()}
            >
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : (
          <PasswordForm onSignedIn={onSignedIn} />
        )}

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className="mt-3 h-10 w-full text-muted-foreground"
            onClick={onCancel}
          >
            <ArrowLeft aria-hidden="true" />
            Back to dashboard
          </Button>
        )}
      </main>
    </div>
  );
}
