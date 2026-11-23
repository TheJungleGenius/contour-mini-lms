// Wire shapes shared by every endpoint, used by the server and the browser.

/** Body of every error response: `{ error: { code, message, details? } }`. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
};

/** A page of a keyset-paginated list. `nextCursor` is null on the last page. */
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
