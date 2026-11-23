import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** A Supabase client typed against this project's schema. */
export type TypedSupabaseClient = SupabaseClient<Database>;
