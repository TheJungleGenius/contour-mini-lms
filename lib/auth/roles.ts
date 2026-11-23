import type { Database } from "@/lib/database.types";

/**
 * Role rules shared by the proxy, the session helper and the guards. Pure and
 * dependency-free, so it's safe to import from any runtime.
 */

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Reads the `user_role` claim set by the Custom Access Token Hook. Anything
 * unexpected falls back to the least-privileged role.
 */
export function roleFromClaim(claim: unknown): AppRole {
  return claim === "admin" ? "admin" : "student";
}

/** Where each role lands after signing in. */
export function homePathFor(role: AppRole): string {
  return role === "admin" ? "/admin" : "/dashboard";
}
