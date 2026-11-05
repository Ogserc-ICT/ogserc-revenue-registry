import { type PillTone, StatusPill } from "./ui/misc";
import type { RegistrationStatus } from "@/lib/registration";

const TONES: Record<RegistrationStatus, PillTone> = {
  Registered: "emerald",
  "Part-paid": "gold",
  "Not registered": "muted",
  "Fee not set": "slate",
};

export function RegistrationPill({ status }: { status: RegistrationStatus }) {
  return <StatusPill tone={TONES[status]}>{status}</StatusPill>;
}
