import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import App from "@/App";
import { applyAuthSession, useAuthSession } from "@/hooks/useAuthSession";
import { signOut } from "@/lib/api/auth";
import { toastError } from "@/lib/toast";
import { accessForSession, OPEN_AUTH_SESSION } from "@shared/auth";

// Most dashboards run without auth, so the sign-in screen loads only when it is needed.
const SignInScreen = lazy(() =>
  import("@/components/auth/SignInScreen").then((module) => ({ default: module.SignInScreen }))
);

/** Shows the dashboard, the read-only dashboard, or the sign-in screen, as the session allows. */
export function AuthGate() {
  const queryClient = useQueryClient();
  const { data, isError } = useAuthSession();
  const [signingIn, setSigningIn] = useState(false);

  // A first visit waits for the answer. If the server can't be reached, the dashboard shows its
  // own offline states, and the first request that gets through corrects the access.
  const session = data ?? (isError ? OPEN_AUTH_SESSION : null);
  if (!session) return null;

  const access = accessForSession(session);
  if (access === "sign-in" || (signingIn && access === "view")) {
    return (
      <Suspense fallback={null}>
        <SignInScreen
          mode={session.mode}
          onCancel={access === "view" ? () => setSigningIn(false) : undefined}
          onSignedIn={(next) => {
            setSigningIn(false);
            applyAuthSession(queryClient, next);
          }}
        />
      </Suspense>
    );
  }

  return (
    <App
      auth={session}
      onSignIn={() => setSigningIn(true)}
      onSignOut={() => {
        signOut().then(
          (next) => applyAuthSession(queryClient, next),
          (error: unknown) => toastError(error, "Couldn't sign out")
        );
      }}
    />
  );
}
