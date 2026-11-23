import "server-only";
import { fromPostgrestError } from "@/lib/api/errors";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Data access for profiles. Runs as the user, so RLS limits students to their
 * own row (admins can read all).
 */

export type ProfileName = { firstName: string; lastName: string };

/** The user's display name, or null if they have no profile row. */
export async function getProfileName(
  supabase: TypedSupabaseClient,
  userId: string,
): Promise<ProfileName | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw fromPostgrestError(error);
  return data ? { firstName: data.first_name, lastName: data.last_name } : null;
}
