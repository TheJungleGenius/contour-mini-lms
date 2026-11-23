"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);

  const logout = async () => {
    setIsPending(true);
    try {
      await authClient.signOut();
    } catch {
      setIsPending(false);
      toast.error("Could not log out. Please try again.");
      return;
    }
    // A full page load, not router.push. With cacheComponents, Next keeps
    // visited routes alive in hidden <Activity> trees, so client state (this
    // button, form drafts, the query cache) would survive into the next user's
    // session. Reloading drops all of it. See the Next.js guide "Preserving UI
    // state", section "State and authentication".
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full reload is the point
    window.location.href = "/auth/login";
  };

  return (
    <Button onClick={logout} disabled={isPending}>
      {isPending ? "Logging out..." : "Logout"}
    </Button>
  );
}
