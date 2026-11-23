/**
 * Turns an untrusted `next` value (e.g. from an email link) into a same-origin
 * path that's safe to redirect to, or "/" if it isn't.
 *
 * Prefix checks on the raw string ("starts with / but not //") aren't enough:
 * browsers strip tabs and newlines from URLs, so "/\t/evil.example" becomes
 * "//evil.example", and dot segments like "/.//evil.example" normalise to
 * "//evil.example". So the value is parsed the way a browser would parse it,
 * the origin is checked, and only the normalised path is returned.
 */
export function safeRedirectPath(next: string | null | undefined, origin: string): string {
  if (!next) return "/";

  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return "/";
  }
  if (url.origin !== new URL(origin).origin) return "/";

  // A path that still starts with "//" would be protocol-relative once
  // redirected, so collapse leading slashes to one.
  const path = url.pathname.replace(/^\/+/, "/");
  return `${path}${url.search}${url.hash}`;
}
