import { Construction, ShieldAlert } from "lucide-react";
import { ButtonLink } from "./ui/button";
import { EmptyState, PageHeader } from "./ui/misc";
import type { Capability } from "@/lib/permissions";
import { gatePage } from "@/lib/session";

/** A page whose screen arrives in a later build phase. Still role-gated like the real page. */
export async function PlaceholderPage({
  title,
  description,
  capability,
  message,
  action,
}: {
  title: string;
  description: string;
  capability: Capability;
  message: string;
  action?: { href: string; label: string };
}) {
  const gate = await gatePage(capability);
  if (!gate.ok) return <NoAccess title={title} />;
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={<Construction aria-hidden className="size-6" />}
        message={message}
        action={action ? <ButtonLink href={action.href} variant="secondary">{action.label}</ButtonLink> : undefined}
      />
    </>
  );
}

export function NoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} description="This page is limited to certain roles." />
      <EmptyState
        icon={<ShieldAlert aria-hidden className="size-6" />}
        message="Your role doesn't include this page. Ask an Admin if you need access."
        action={<ButtonLink href="/dashboard" variant="secondary">Go to the dashboard</ButtonLink>}
      />
    </>
  );
}
