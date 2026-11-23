"use client";

import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type InfiniteQuery = Pick<
  UseInfiniteQueryResult,
  "isPending" | "isError" | "error" | "refetch" | "hasNextPage" | "fetchNextPage" | "isFetchingNextPage"
>;

/** Loading / error / empty states shared by the consultation lists. */
export function ListState({
  query,
  isEmpty,
  emptyText,
  children,
}: {
  query: InfiniteQuery;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (query.isPending) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm">
        <p className="text-destructive">{query.error?.message ?? "Something went wrong"}</p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (isEmpty) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return <>{children}</>;
}

export function ListFooter({ query }: { query: InfiniteQuery }) {
  if (!query.hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <Button
        variant="outline"
        onClick={() => query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
      >
        {query.isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
