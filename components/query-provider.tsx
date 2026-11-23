"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/auth-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // One client per browser session (not module-level, so it's never shared
  // between requests during SSR).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
        },
      }),
  );

  // The provider sits in the root layout, so it survives client-side
  // navigation. Cached data belongs to whoever was signed in when it was
  // fetched: drop all of it whenever the signed-in user changes.
  useEffect(() => authClient.onUserChange(() => queryClient.clear()), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
