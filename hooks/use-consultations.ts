"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { Page } from "@/lib/api/types";
import { consultationsApi } from "@/lib/consultations/api-client";
import type { Consultation, ConsultationStatus } from "@/lib/consultations/types";
import type {
  CreateConsultationInput,
  UpdateConsultationInput,
} from "@/lib/consultations/validation";

/**
 * Server-state hooks for consultations: caching, pagination and cache
 * invalidation. Transport lives in consultationsApi; components only use these.
 */

export const consultationKeys = {
  all: ["consultations"] as const,
  mine: () => [...consultationKeys.all, "mine"] as const,
  mineList: (status?: ConsultationStatus) => [...consultationKeys.mine(), status ?? "all"] as const,
  admin: () => [...consultationKeys.all, "admin"] as const,
  adminList: (status?: ConsultationStatus) => [...consultationKeys.admin(), status ?? "all"] as const,
};

const pagination = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: Page<unknown>) => last.nextCursor ?? undefined,
};

export function useMyConsultations(status?: ConsultationStatus) {
  return useInfiniteQuery({
    queryKey: consultationKeys.mineList(status),
    queryFn: ({ pageParam, signal }) =>
      consultationsApi.listMine({ status, cursor: pageParam }, { signal }),
    ...pagination,
  });
}

export function useAdminConsultations(status?: ConsultationStatus) {
  return useInfiniteQuery({
    queryKey: consultationKeys.adminList(status),
    queryFn: ({ pageParam, signal }) =>
      consultationsApi.listAll({ status, cursor: pageParam }, { signal }),
    ...pagination,
  });
}

export function useBookConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConsultationInput) => consultationsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: consultationKeys.mine() }),
  });
}

type UpdateVars = { id: string; input: UpdateConsultationInput };
type MineData = InfiniteData<Page<Consultation>, string | undefined>;

export function useUpdateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) => consultationsApi.update(id, input),

    // Optimistic update for the complete/incomplete checkbox so it feels instant.
    // Other changes wait for the server.
    onMutate: async ({ id, input }) => {
      if (!("status" in input) || input.status === "cancelled") return { previous: [] };

      await queryClient.cancelQueries({ queryKey: consultationKeys.mine() });
      const previous = queryClient.getQueriesData<MineData>({ queryKey: consultationKeys.mine() });

      queryClient.setQueriesData<MineData>({ queryKey: consultationKeys.mine() }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((c) => (c.id === id ? { ...c, status: input.status } : c)),
              })),
            }
          : data,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: consultationKeys.mine() }),
  });
}
