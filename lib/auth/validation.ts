import { z } from "zod";
import { personName } from "@/lib/profiles/validation";

// Client-side rules for the auth forms, for early feedback. Supabase Auth
// enforces the real ones (minimum_password_length in supabase/config.toml).
export const PASSWORD_MIN = 8;

const email = z.email("Enter a valid email address");

const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`);

const passwordsMatch = {
  check: (v: { password: string; repeatPassword: string }) => v.password === v.repeatPassword,
  params: { path: ["repeatPassword"], message: "Passwords do not match" },
};

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    firstName: personName("First name"),
    lastName: personName("Last name"),
    email,
    password: newPassword,
    repeatPassword: z.string(),
  })
  .refine(passwordsMatch.check, passwordsMatch.params);
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const updatePasswordSchema = z
  .object({ password: newPassword, repeatPassword: z.string() })
  .refine(passwordsMatch.check, passwordsMatch.params);
export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;
