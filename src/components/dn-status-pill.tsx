import { StatusPill } from "./ui/misc";
import { DN_STATUS_TONES, type DnStatus } from "@/lib/demandNotice";

/** Demand notice status pill, coloured per DESIGN.md 4. */
export function DnStatusPill({ status }: { status: DnStatus }) {
  return <StatusPill tone={DN_STATUS_TONES[status]}>{status}</StatusPill>;
}
