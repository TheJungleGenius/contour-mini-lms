import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Layering: UI code reaches Supabase only through lib/auth/auth-client (auth)
  // and the REST API (data), never the SDK directly. Server-only modules
  // (repositories, guards) are already blocked from client bundles by
  // `server-only`.
  {
    files: ["components/**", "hooks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/*", "@supabase/*"],
              message:
                "UI code must not use Supabase directly: use lib/auth/auth-client for auth and the hooks / API client for data.",
            },
          ],
        },
      ],
    },
  },
  // Build output and generated files. Without these, `eslint .` lints the
  // generated route types in .next/ and reports thousands of false errors.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/database.types.ts"]),
]);

export default eslintConfig;
