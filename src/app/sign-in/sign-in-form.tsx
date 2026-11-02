"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";

export function SignInForm({ callbackUrl, notice }: { callbackUrl: string; notice?: string }) {
  const [state, action, pending] = useActionState(signInAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="mt-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {notice && !state && <FormMessage tone="success">{notice}</FormMessage>}

      <Field label="Email" htmlFor="email" error={errors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          {...describedBy("email", errors?.email)}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={errors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          {...describedBy("password", errors?.password)}
        />
      </Field>

      {state && !state.ok && !errors && <FormMessage tone="error">{state.error}</FormMessage>}

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
