/**
 * Error codes the /auth/error page understands. Routes redirect there with
 * `?code=<one of these>`. The page only ever shows these fixed messages, never
 * text from the URL, so nobody can craft a link that displays their own message.
 */
export const AUTH_ERROR_MESSAGES = {
  invalid_link: "This link is invalid or has expired. Please request a new one.",
  missing_token: "This link is incomplete. Please use the full link from your email.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

const GENERIC_MESSAGE = "An unspecified error occurred.";

/** The message the /auth/error page shows for a `?code=` value. */
export function authErrorPageMessage(code: string | undefined): string {
  return code && Object.hasOwn(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code as AuthErrorCode]
    : GENERIC_MESSAGE;
}
