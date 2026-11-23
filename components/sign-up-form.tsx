"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient, authErrorMessage } from "@/lib/auth/auth-client";
import { signUpSchema, type SignUpValues } from "@/lib/auth/validation";
import { NAME_MAX } from "@/lib/profiles/validation";
import { cn } from "@/lib/utils";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", repeatPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { signedIn } = await authClient.signUp(values);
      // Next keeps this page's state alive (hidden) after navigating away;
      // don't leave the passwords sitting in it.
      form.resetField("password");
      form.resetField("repeatPassword");
      // With email confirmation disabled (local dev), the user is signed in at once.
      router.push(signedIn ? "/" : "/auth/sign-up-success");
    } catch (err) {
      form.setError("root", { message: authErrorMessage(err) });
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a student account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="First name" htmlFor="first-name" error={errors.firstName?.message}>
                  <Input
                    id="first-name"
                    autoComplete="given-name"
                    maxLength={NAME_MAX}
                    {...form.register("firstName")}
                  />
                </FormField>
                <FormField label="Last name" htmlFor="last-name" error={errors.lastName?.message}>
                  <Input
                    id="last-name"
                    autoComplete="family-name"
                    maxLength={NAME_MAX}
                    {...form.register("lastName")}
                  />
                </FormField>
              </div>
              <FormField label="Email" htmlFor="email" error={errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  {...form.register("email")}
                />
              </FormField>
              <FormField label="Password" htmlFor="password" error={errors.password?.message}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("password")}
                />
              </FormField>
              <FormField
                label="Repeat Password"
                htmlFor="repeat-password"
                error={errors.repeatPassword?.message}
              >
                <Input
                  id="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("repeatPassword")}
                />
              </FormField>
              {errors.root && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.root.message}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating an account..." : "Sign up"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
