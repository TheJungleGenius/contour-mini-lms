import "server-only";
import { notFound, redirect } from "next/navigation";
import { forbidden, notFound as apiNotFound, unauthenticated } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";
import { homePathFor, type AppRole } from "./roles";
import { getSessionUser } from "./session";

/**
 * Authorisation guards. These are the *application* layer of defence in depth:
 *   proxy (redirects, for UX) -> these guards -> Postgres GRANTs + RLS (the guarantee).
 *
 * The Supabase client returned here always carries the user's own JWT (never
 * the service-role key), so RLS still applies even if a guard is wrong.
 */

/** For route handlers: throws ApiError (401 / 403 / 404). */
export async function requireApiUser(role: AppRole) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) throw unauthenticated();

  if (user.role !== role) {
    // Admin endpoints are hidden from non-admins entirely (404, not 403), so
    // the API matches the UI. Student endpoints are no secret; admins get 403.
    throw role === "admin" ? apiNotFound() : forbidden();
  }
  return { supabase, user };
}

/** For pages open to everyone: the signed-in user, or null. */
export async function getCurrentUser() {
  return getSessionUser(await createClient());
}

/** For pages: redirects or renders the 404 page. */
export async function requirePageUser(role: AppRole) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/auth/login");

  if (user.role !== role) {
    if (role === "admin") notFound(); // non-admins can't tell /admin exists
    redirect(homePathFor(user.role));
  }
  return { supabase, user };
}
