"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import {
  authClient,
  authErrorMessage,
  needsReauthentication,
} from "@/lib/auth/auth-client";
import { updatePasswordSchema, type UpdatePasswordValues } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const [mustReauthenticate, setMustReauthenticate] = useState(false);
  const form = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", repeatPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setMustReauthenticate(false);
    try {
      await authClient.updatePassword(password);
      // Next keeps this page's state alive (hidden) after navigating away;
      // don't leave the passwords sitting in it.
      form.reset();
      router.push("/"); // the root page routes by role
    } catch (err) {
      if (needsReauthentication(err)) {
        // The session isn't recent enough to change the password without
        // proving it's the account owner: send them through a reset link.
        setMustReauthenticate(true);
      } else {
        form.setError("root", { message: authErrorMessage(err) });
      }
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>
            Please enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-6">
              <FormField label="New password" htmlFor="password" error={errors.password?.message}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register("password")}
                />
              </FormField>
              <FormField
                label="Repeat new password"
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
              {mustReauthenticate && (
                <p role="alert" className="text-sm text-destructive">
                  For your security, use a password reset link to change your password.{" "}
                  <Link href="/auth/forgot-password" className="underline underline-offset-4">
                    Send me a link
                  </Link>
                </p>
              )}
              {errors.root && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.root.message}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
