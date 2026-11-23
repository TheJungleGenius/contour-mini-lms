import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homePathFor, roleFromClaim } from "@/lib/auth/roles";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// Pages a signed-out user may visit.
const PUBLIC_PATH_PREFIXES = ["/auth"];
// Auth pages a signed-in user has no reason to see.
const GUEST_ONLY_PATHS = ["/auth/login", "/auth/sign-up"];

/**
 * Refreshes the Supabase session cookie on every request and does coarse,
 * UX-level routing. This is NOT the authorisation boundary: pages, route
 * handlers and RLS each enforce access on their own.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable. Always
  // create a new one on each request.
  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): it refreshes
  // the session, and code in between can cause users to be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { pathname } = request.nextUrl;

  // API routes answer for themselves (401/403/404 JSON); never redirect them.
  if (pathname.startsWith("/api/")) return supabaseResponse;

  // Match whole path segments: "/auth" and "/auth/…", but not "/authority".
  const isPublic = PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!claims && !isPublic) {
    return redirectPreservingCookies(request, supabaseResponse, "/auth/login");
  }

  if (claims && GUEST_ONLY_PATHS.includes(pathname)) {
    const home = homePathFor(roleFromClaim(claims.user_role));
    return redirectPreservingCookies(request, supabaseResponse, home);
  }

  // Return supabaseResponse as-is so refreshed session cookies reach the browser.
  return supabaseResponse;
}

/** Redirects while keeping any refreshed auth cookies (see the @supabase/ssr docs). */
function redirectPreservingCookies(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const response = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
