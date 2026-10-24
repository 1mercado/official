import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  GitFork,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  ShoppingBasket,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSession } from "@/hooks/use-session";
import { adminSections } from "@/lib/admin-sections";
import { formatPeso } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/session.functions";

type AppPath =
  | "/catalog"
  | "/dashboard"
  | "/genealogy"
  | "/network"
  | "/earnings"
  | "/withdrawals"
  | "/plan"
  | "/marketing"
  | "/profile";

type NavItem = {
  label: string;
  to: AppPath;
  icon: typeof Users;
};

const nav: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Grocery Shopping", to: "/catalog", icon: ShoppingBasket },
  { label: "Binary Genealogy", to: "/genealogy", icon: GitFork },
  { label: "My Network", to: "/network", icon: Users },
  { label: "Earnings", to: "/earnings", icon: BarChart3 },
  { label: "Wallet & Withdrawals", to: "/withdrawals", icon: Wallet },
  { label: "Compensation Plan", to: "/plan", icon: BookOpen },
  { label: "Marketing Materials", to: "/marketing", icon: Megaphone },
  { label: "Profile & Payouts", to: "/profile", icon: Settings },
];

const linkClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-white/90 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none";
const activeClass =
  "bg-brand-gradient text-primary-foreground shadow-soft hover:bg-none hover:text-primary-foreground";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1" aria-label="Navigation">
      {nav.map(({ label, to, icon: Icon }) => (
        <Link
          key={label}
          to={to}
          onClick={onNavigate}
          className={cn(linkClass, path === to && activeClass)}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Super admin only: every admin console section as its own sidebar link. */
function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useRouterState({ select: (s) => s.location });
  const { member } = useSession();
  if (!member.isAdmin) return null;
  const onAdmin = location.pathname === "/admin";
  const search = location.search as { tab?: string };
  const current = onAdmin ? (search.tab ?? "entries") : null;
  return (
    <nav
      className="space-y-1 border-t border-border/60 pt-4"
      aria-label="Admin console"
    >
      <p className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold tracking-wider text-white/75 uppercase">
        <ShieldCheck className="size-3.5 text-primary" />
        Admin Console
      </p>
      {adminSections.map(({ tab, label, icon: Icon }) => (
        <Link
          key={tab}
          to="/admin"
          search={{ tab }}
          onClick={onNavigate}
          aria-current={current === tab ? "page" : undefined}
          className={cn(linkClass, current === tab && activeClass)}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { wallet, member } = useSession();
  const router = useRouter();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function onSignOut() {
    setLeaving(true);
    try {
      await signOut();
      await navigate({ to: "/auth", search: { mode: "signin" } });
      router.clearCache();
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="relative h-full bg-[oklch(0.22_0.04_160)] text-white [--muted-foreground:oklch(0.85_0.01_160)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-[oklch(0.42_0.1_155)] via-[oklch(0.3_0.075_158)] to-[oklch(0.2_0.045_160)]"
      />
      <div className="relative flex h-full flex-col gap-6 overflow-y-auto p-5">
        <Brand subtitle="Shopping" />
        <NavList onNavigate={onNavigate} />
        <AdminNav onNavigate={onNavigate} />
        <div className="mt-auto space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-4 text-primary-foreground shadow-soft">
            <div className="absolute -top-8 -right-8 size-24 rounded-full bg-white/20 blur-xl" />
            <p className="text-xs text-primary-foreground/80">
              Available balance
            </p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatPeso(wallet.balance)}
            </p>
            <Button variant="gold" size="sm" className="mt-3 w-full" asChild>
              <Link to="/withdrawals" onClick={onNavigate}>
                Withdraw now
              </Link>
            </Button>
          </div>
          <p className="truncate px-1 text-xs text-white/75">
            Signed in as{" "}
            <span className="font-bold text-white">@{member.username}</span>
          </p>
          <Button
            variant="ghost"
            className="w-full justify-start text-white/75"
            onClick={onSignOut}
            disabled={leaving}
          >
            <LogOut /> {leaving ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen overflow-hidden border-r border-border/60 bg-sidebar backdrop-blur-xl lg:block">
        <SidebarBody />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Brand />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Member dashboard and account navigation
            </SheetDescription>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  footer,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  tone?: "default" | "brand" | "gold";
  footer?: ReactNode;
}) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl bg-secondary text-primary",
            tone === "brand" && "bg-brand-gradient text-primary-foreground",
            tone === "gold" && "bg-gold-gradient text-gold-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {footer}
    </div>
  );
}
