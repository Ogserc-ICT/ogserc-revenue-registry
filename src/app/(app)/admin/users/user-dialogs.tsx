"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Role } from "@/db/schema";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { createUserAction, resetPasswordAction, setUserActiveAction, updateRolesAction } from "./actions";

const ROLE_HINTS: Record<Role, string> = {
  admin: "Everything, including users, settings and serial numbers.",
  revenue_officer: "Payers, demand notices, receipts and reports.",
  finance_officer: "Confirms and reverses receipts, cancels notices, bank recon.",
  viewer: "Read-only dashboards, reports and the register.",
};

function RoleCheckboxes({ defaultRoles = [], error }: { defaultRoles?: Role[]; error?: string }) {
  return (
    <fieldset aria-describedby={error ? "roles-error" : undefined}>
      <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        Roles <span aria-hidden className="size-1.5 rounded-pill bg-emerald-400" />
        <span className="sr-only">(at least one required)</span>
      </legend>
      <div className="flex flex-col gap-2.5">
        {ROLES.map((role) => (
          <label key={role} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={defaultRoles.includes(role)}
              className="mt-0.5 size-4 accent-[var(--emerald-600)]"
            />
            <span>
              <span className="block text-base">{ROLE_LABELS[role]}</span>
              <span className="block text-sm text-muted">{ROLE_HINTS[role]}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="roles-error" className="mt-2 text-sm text-rose-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Shows a temporary password once, with a copy button. */
function TempPasswordNotice({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-muted">
        Give this temporary password to the user for <span className="text-text">{email}</span>. It is shown
        only once. They must change it when they first sign in.
      </p>
      <div className="flex items-center gap-2 rounded-control border border-border bg-surface-raised p-3">
        <code className="money flex-1 text-lg font-semibold tracking-wide">{password}</code>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <UserPlus aria-hidden className="size-4" /> Create user
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Create user">
        <CreateUserForm key={formKey} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useFormAction(createUserAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok && state.message) toast(state.message);
  }, [state, toast]);

  if (state?.ok && state.data) {
    return (
      <div className="flex flex-col gap-5">
        <TempPasswordNotice email={state.data.email} password={state.data.tempPassword} />
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={action} className="flex flex-col gap-4" noValidate>
      <Field label="Full name" htmlFor="name" required error={e?.name}>
        <Input id="name" name="name" autoComplete="off" data-autofocus {...describedBy("name", e?.name)} />
      </Field>
      <Field label="Email" htmlFor="email" required error={e?.email}>
        <Input id="email" name="email" type="email" autoComplete="off" {...describedBy("email", e?.email)} />
      </Field>
      <RoleCheckboxes error={e?.roles} />
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </Button>
      </div>
    </form>
  );
}

interface RowUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
}

export function UserRowActions({ user, isSelf }: { user: RowUser; isSelf: boolean }) {
  const [dialog, setDialog] = useState<null | "roles" | "reset" | "active">(null);
  const close = () => setDialog(null);
  if (isSelf) return <span className="text-sm text-muted">Use Change password</span>;
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" onClick={() => setDialog("roles")} disabled={!user.active}>
        Edit roles
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDialog("reset")} disabled={!user.active}>
        Reset password
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDialog("active")}>
        {user.active ? "Deactivate" : "Reactivate"}
      </Button>

      <Dialog open={dialog === "roles"} onClose={close} title={`Roles for ${user.name}`} description={user.email}>
        {dialog === "roles" && <EditRolesForm user={user} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === "reset"} onClose={close} title={`Reset password for ${user.name}`}>
        {dialog === "reset" && <ResetPasswordPanel user={user} onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog === "active"}
        onClose={close}
        title={user.active ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
      >
        {dialog === "active" && <ActivePanel user={user} onDone={close} />}
      </Dialog>
    </div>
  );
}

function EditRolesForm({ user, onDone }: { user: RowUser; onDone: () => void }) {
  const [state, action, pending] = useFormAction(updateRolesAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Roles updated");
      onDone();
    }
  }, [state, toast, onDone]);
  return (
    <form onSubmit={action} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <RoleCheckboxes defaultRoles={user.roles} error={e?.roles} />
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save roles"}
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordPanel({ user, onDone }: { user: RowUser; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof resetPasswordAction>> | null>(null);
  const toast = useToast();

  if (result?.ok && result.data) {
    return (
      <div className="flex flex-col gap-5">
        <TempPasswordNotice email={result.data.email} password={result.data.tempPassword} />
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-muted">
        {user.name} gets a new one-time temporary password and must choose a new password at their next
        sign-in. Their current password stops working straight away.
      </p>
      {result && !result.ok && <FormMessage tone="error">{result.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await resetPasswordAction(user.id);
              setResult(r);
              if (r.ok && r.message) toast(r.message);
            })
          }
        >
          {pending ? "Issuing…" : "Issue temporary password"}
        </Button>
      </div>
    </div>
  );
}

function ActivePanel({ user, onDone }: { user: RowUser; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const activate = !user.active;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-muted">
        {activate
          ? `${user.name} will be able to sign in again with their existing password.`
          : `${user.name} won't be able to sign in, and is signed out on their next action. Their records and audit history stay.`}
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant={activate ? "primary" : "danger"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setUserActiveAction(user.id, activate);
              if (!r.ok) setError(r.error);
              else {
                toast(r.message ?? "Saved");
                onDone();
              }
            })
          }
        >
          {pending ? "Saving…" : activate ? "Reactivate user" : "Deactivate user"}
        </Button>
      </div>
    </div>
  );
}
