import { z } from "zod";

/**
 * The app's configuration, validated once at startup so a missing or malformed
 * value fails loudly here instead of as an obscure error deep in a request.
 *
 * Only public values belong here: NEXT_PUBLIC_* variables are inlined into the
 * browser bundle. The app never uses Supabase's secret / service-role key.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

// Each variable is read with a literal `process.env.NAME`: Next.js only
// inlines NEXT_PUBLIC_* values for the browser when they're accessed that way.
const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration (see .env.example):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = {
  supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} as const;
