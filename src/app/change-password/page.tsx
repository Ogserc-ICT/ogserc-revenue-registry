import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser } from "@/lib/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const forced = user.mustChangePassword;

  return (
    <AuthFrame>
      <h1 className="text-lg font-semibold">{forced ? "Choose your password" : "Change password"}</h1>
      <p className="mt-1 text-base text-muted">
        {forced
          ? `Welcome, ${user.name}. Replace your temporary password to finish signing in.`
          : `Signed in as ${user.email}.`}
      </p>
      <ChangePasswordForm forced={forced} />
    </AuthFrame>
  );
}
