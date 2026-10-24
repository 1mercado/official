import {
  Banknote,
  Coins,
  KeyRound,
  ShoppingBasket,
  Settings2,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";

/** Admin console sections, shared by the console tabs and the sidebar. */
export const adminSections = [
  { tab: "entries", label: "Registrations", icon: UserCheck },
  { tab: "withdrawals", label: "Withdrawal Requests", icon: Banknote },
  { tab: "catalog", label: "Grocery Products & Orders", icon: ShoppingBasket },
  { tab: "codes", label: "Activation Codes", icon: Ticket },
  { tab: "members", label: "Member Management", icon: Users },
  { tab: "credits", label: "Credits Ledger", icon: Coins },
  { tab: "passwords", label: "Password Help", icon: KeyRound },
  { tab: "settings", label: "Plan Settings", icon: Settings2 },
] as const;

export type AdminTab = (typeof adminSections)[number]["tab"];

export const adminTabs = adminSections.map((s) => s.tab) as [
  AdminTab,
  ...AdminTab[],
];
