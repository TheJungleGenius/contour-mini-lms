const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Formats an ISO timestamp in the viewer's locale and timezone. The server
 * doesn't know either, so call this only in output rendered in the browser.
 */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
