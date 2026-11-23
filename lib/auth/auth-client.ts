import { isAuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { LoginValues, SignUpValues } from "./validation";

/**
 * Browser-side authentication: the only client module that talks to Supabase
 * Auth, so components work with app-level operations rather than SDK calls.
 * Every function throws on failure; use authErrorMessage() to display it.
 */
export const authClient = {
  async signIn({ email, password }: LoginValues): Promise<void> {
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  /** Returns whether the user is now signed in (false: confirm by email first). */
  async signUp({ firstName, lastName, email, password }: SignUpValues): Promise<{ signedIn: boolean }> {
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        // "/" routes by role once the email link signs the user in.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
        // Display data only. The role is always assigned server-side
        // (handle_new_user trigger) and is never read from metadata.
        data: { first_name: firstName, last_name: lastName },
      },
    });
    if (error) throw error;
    return { signedIn: data.session !== null };
  },

  async sendPasswordReset(email: string): Promise<void> {
    // The redirect URL must be allowed in Supabase Auth's redirect URL settings.
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (error) throw error;
  },

  async updatePassword(password: string): Promise<void> {
    const { error } = await createClient().auth.updateUser({ password });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    const { error } = await createClient().auth.signOut();
    if (error) throw error;
  },

  /**
   * Calls `listener` whenever a different user signs in, or the user signs
   * out. Token refreshes and the initial session don't count as changes.
   * Returns an unsubscribe function.
   */
  onUserChange(listener: (userId: string | null) => void): () => void {
    let currentUserId: string | null | undefined; // undefined until INITIAL_SESSION
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      if (currentUserId !== undefined && userId !== currentUserId) listener(userId);
      currentUserId = userId;
    });
    return () => subscription.unsubscribe();
  },
};

/**
 * True when Supabase refuses a password change because the session isn't
 * recent enough (secure_password_change in supabase/config.toml).
 */
export function needsReauthentication(err: unknown): boolean {
  return isAuthError(err) && err.code === "reauthentication_needed";
}

export function authErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
