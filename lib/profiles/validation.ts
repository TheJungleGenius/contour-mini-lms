import { z } from "zod";

/** Matches the CHECK constraints on profiles and consultations name columns. */
export const NAME_MAX = 100;

/** A required, trimmed person name (first or last). */
export const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(NAME_MAX, `${label} must be at most ${NAME_MAX} characters`);
