import "server-only";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { roleFromClaim, type AppRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
};

/**
 * Resolves the current user from the verified JWT. getClaims() checks the
 * token's signature (it never trusts the cookie as-is), and `user_role` is set
 * by the Custom Access Token Hook from the user_roles table.
 */
export async function getSessionUser(
  supabase: TypedSupabaseClient,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const { claims } = data;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: roleFromClaim(claims.user_role),
  };
}
