"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { signOutAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useFormAction(changePasswordAction);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast("Password changed");
      router.replace("/dashboard");
      router.refresh();
    }
  }, [state, router, toast]);

  const hint = `At least ${MIN_PASSWORD_LENGTH} characters, different from your current password.`;

  return (
    <>
      <form onSubmit={action} className="mt-6 flex flex-col gap-4" noValidate>
        <Field
          label={forced ? "Temporary password" : "Current password"}
          htmlFor="currentPassword"
          required
          error={errors?.currentPassword}
        >
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            {...describedBy("currentPassword", errors?.currentPassword)}
          />
        </Field>
        <Field label="New password" htmlFor="newPassword" required hint={hint} error={errors?.newPassword}>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            {...describedBy("newPassword", errors?.newPassword, hint)}
          />
        </Field>
        <Field label="Type the new password again" htmlFor="confirmPassword" required error={errors?.confirmPassword}>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            {...describedBy("confirmPassword", errors?.confirmPassword)}
          />
        </Field>

        {state && !state.ok && !errors && <FormMessage tone="error">{state.error}</FormMessage>}

        <Button type="submit" className="mt-2 w-full" disabled={pending || state?.ok}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </form>

      <div className="mt-4 text-center text-sm">
        {forced ? (
          <form action={signOutAction}>
            <button type="submit" className="text-muted underline-offset-4 hover:text-text hover:underline">
              Sign out instead
            </button>
          </form>
        ) : (
          <Link href="/dashboard" className="text-muted underline-offset-4 hover:text-text hover:underline">
            Back to the dashboard
          </Link>
        )}
      </div>
    </>
  );
}
