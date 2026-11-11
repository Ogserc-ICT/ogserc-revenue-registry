import {
  BookOpenText,
  Building2,
  ClipboardList,
  DatabaseBackup,
  FilePlus2,
  Files,
  Hourglass,
  Landmark,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  ScrollText,
  Settings,
  Stamp,
  Table2,
  Tags,
  Target,
  UserCog,
  Zap,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  receipt: ReceiptText,
  register: ListChecks,
  notice: FilePlus2,
  notices: Files,
  payers: Building2,
  summary: Table2,
  budget: Target,
  arrears: Hourglass,
  bank: Landmark,
  audit: ScrollText,
  fees: Tags,
  registration: ClipboardList,
  licence: Zap,
  revenueBudget: PiggyBank,
  settings: Settings,
  receiver: Stamp,
  users: UserCog,
  data: DatabaseBackup,
  guide: BookOpenText,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}
