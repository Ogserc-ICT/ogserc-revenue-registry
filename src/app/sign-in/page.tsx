import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { getCurrentUser } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Staff sign-in" };

const NOTICES: Record<string, string> = {
  "signed-out": "You have signed out. Sign in again to continue.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  const { callbackUrl, reason } = await searchParams;
  return (
    <AuthFrame>
      <h1 className="text-lg font-semibold">Staff sign-in</h1>
      <p className="mt-1 text-base text-muted">Accounts are created by the system administrator.</p>
      <SignInForm callbackUrl={callbackUrl ?? "/dashboard"} notice={reason ? NOTICES[reason] : undefined} />
    </AuthFrame>
  );
}
