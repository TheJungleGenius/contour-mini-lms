import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { AuthErrorCode } from "@/lib/auth/auth-errors";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// The email link types Supabase Auth sends; anything else is rejected.
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

const isEmailOtpType = (value: string | null): value is EmailOtpType =>
  value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);

const errorPage = (code: AuthErrorCode) => `/auth/error?code=${code}`;

/** Landing route for email links (sign-up confirmation, password reset). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // The template passed `next` straight to redirect(), an open redirect.
  const next = safeRedirectPath(searchParams.get("next"), origin);

  if (!tokenHash || !isEmailOtpType(type)) redirect(errorPage("missing_token"));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  // Supabase's message isn't shown to the user: the error page only displays
  // fixed messages, so a crafted URL can't put arbitrary text on screen.
  redirect(error ? errorPage("invalid_link") : next);
}
