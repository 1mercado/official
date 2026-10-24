import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  Banknote,
  Check,
  Coins,
  KeyRound,
  Loader2,
  Search,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader, StatCard } from "@/components/app-shell";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLiveSync } from "@/hooks/use-live-sync";
import { adminTabs, type AdminTab } from "@/lib/admin-sections";
import { formatDateTime, formatPeso, type Plan } from "@/lib/plan";
import type { PayoutMethod, WithdrawalStatus } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import {
  adjustBalance,
  createMember,
  createPasswordResetLink,
  dismissPasswordHelp,
  deleteActivationCodes,
  deleteMember,
  generateActivationCodes,
  getAdminData,
  getAdminPulse,
  getMemberDetail,
  listWithdrawals,
  reviewEntry,
  reviewWithdrawal,
  saveMemberPayout,
  savePlanSettings,
  searchMembers,
  setMemberPassword,
  updateMember,
  updateMemberFlags,
  voidActivationCodes,
  type AdminData,
  type AdminMember,
  type MemberDetail,
} from "@/server/admin.functions";

export const Route = createFileRoute("/_app/admin")({
  validateSearch: z.object({
    tab: z.enum(adminTabs).optional().catch(undefined),
  }),
  beforeLoad: ({ context }) => {
    if (!context.session.member.isAdmin) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Super Admin Console · 1MERCADO" }] }),
  loader: () => getAdminData(),
  component: AdminConsole,
});

/** Runs an admin action with a toast and refreshes every loader afterwards. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function act<T>(
    key: string,
    task: () => Promise<T>,
    message: string | ((r: T) => string),
  ) {
    setBusy(key);
    try {
      const r = await task();
      toast.success(typeof message === "function" ? message(r) : message);
      await router.invalidate();
      return r;
    } catch (err) {
      toast.error(errorMessage(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}

function Empty({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <TableRow>
      <TableCell
        colSpan={cols}
        className="py-10 text-center text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

function Spin({ on }: { on: boolean }) {
  return on ? <Loader2 className="animate-spin" /> : null;
}

/** Labelled input for the console's plain forms. */
function Field({
  label,
  id,
  className,
  ...props
}: { label: string; id: string } & ComponentProps<typeof Input>) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="rounded-xl" {...props} />
    </div>
  );
}

function statusVariant(status: WithdrawalStatus) {
  return status === "pending"
    ? "warning"
    : status === "paid"
      ? "success"
      : status === "rejected"
        ? "destructive"
        : "secondary";
}

function engineNote(r: { activated: number; credited: number }) {
  return r.activated || r.credited
    ? ` · ${r.activated} activated, ${r.credited} credits posted`
    : "";
}

function EntriesTab() {
  const { batches } = Route.useLoaderData();
  const { busy, act } = useAction();
  return (
    <div className="space-y-6">
      <RegistrationsCard />
      <div className="surface-card overflow-hidden">
        <h2 className="px-5 pt-5 font-display font-bold">Bulk enrolments</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Batch</TableHead>
              <TableHead>Accounts</TableHead>
              <TableHead>Amount due</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="pr-5 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 ? (
              <Empty cols={6}>No bulk enrolments waiting.</Empty>
            ) : (
              batches.map((b) => (
                <BatchRow key={b.batchId} batch={b} busy={busy} act={act} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type Registration = AdminData["registrations"][number];
type RegistrationFilter = Registration["status"] | "all";

const registrationFilters: Array<[RegistrationFilter, string]> = [
  ["pending", "Awaiting review"],
  ["unpaid", "No payment yet"],
  ["rejected", "Declined"],
  ["confirmed", "Approved"],
  ["all", "All"],
];

function registrationBadge(status: Registration["status"]) {
  return status === "confirmed" ? (
    <Badge variant="success">Approved</Badge>
  ) : status === "pending" ? (
    <Badge variant="warning">Awaiting review</Badge>
  ) : status === "rejected" ? (
    <Badge variant="destructive">Declined</Badge>
  ) : (
    <Badge variant="secondary">Unpaid</Badge>
  );
}

/** Every individual sign-up, newest first, refreshed live as members register or submit payment. */
function RegistrationsCard() {
  const { registrations, registrationCounts: counts } = Route.useLoaderData();
  const { busy, act } = useAction();
  const [filter, setFilter] = useState<RegistrationFilter>("pending");
  const [seen] = useState(() => new Set(registrations.map((r) => r.id)));
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const rows =
    filter === "all"
      ? registrations
      : registrations.filter((r) => r.status === filter);

  function review(r: Registration, action: "confirm" | "reject") {
    return act(
      `${action}${r.id}`,
      () => reviewEntry({ data: { memberIds: [r.id], action } }),
      (res) =>
        action === "confirm"
          ? `Approved ${r.username}${engineNote(res)}`
          : `Declined ${r.username}`,
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="font-display font-bold">Registrations</h2>
          <p className="text-xs text-muted-foreground">
            New sign-ups, redeemed activation codes and payment references
            appear here automatically.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter registrations"
        >
          {registrationFilters.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "hero" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} (
              {(value === "all" ? total : (counts[value] ?? 0)).toLocaleString(
                "en-PH",
              )}
              )
            </Button>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Member</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead>Code / reference</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-5 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <Empty cols={7}>
              {filter === "pending"
                ? "No registrations waiting for review."
                : "No registrations in this list."}
            </Empty>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <p className="flex items-center gap-2 font-medium">
                    {r.fullName}
                    {seen.has(r.id) ? null : (
                      <Badge variant="warning">New</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{r.username} · {r.memberCode}
                  </p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <p>{r.mobile || "—"}</p>
                  {r.city ? <p>{r.city}</p> : null}
                </TableCell>
                <TableCell className="text-xs">
                  {r.sponsor ? `@${r.sponsor}` : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.reference ?? "—"}
                  {r.submittedAt ? (
                    <p className="font-sans text-muted-foreground">
                      sent {formatDateTime(r.submittedAt)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </TableCell>
                <TableCell>{registrationBadge(r.status)}</TableCell>
                <TableCell className="pr-5">
                  {r.status === "confirmed" ? (
                    <p className="text-right text-xs text-muted-foreground">
                      Approved
                    </p>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="hero"
                        disabled={busy !== null}
                        onClick={() => review(r, "confirm")}
                      >
                        <Spin on={busy === `confirm${r.id}`} />
                        <Check /> Approve
                      </Button>
                      {r.status === "rejected" ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() => review(r, "reject")}
                        >
                          <Spin on={busy === `reject${r.id}`} />
                          <X /> Decline
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {registrations.length >= 300 ? (
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          Showing the 300 most recent registrations. Use Member Management to
          find older accounts.
        </p>
      ) : null}
    </div>
  );
}

type Act = ReturnType<typeof useAction>["act"];

function BatchRow({
  batch: b,
  busy,
  act,
}: {
  batch: AdminData["batches"][number];
  busy: string | null;
  act: Act;
}) {
  const { plan } = Route.useLoaderData();
  return (
    <TableRow>
      <TableCell className="pl-5">
        <p className="font-medium">{b.fullName}</p>
        <p className="text-xs text-muted-foreground">
          from @{b.firstUsername} · {b.batchId}
        </p>
      </TableCell>
      <TableCell>{b.count.toLocaleString("en-PH")}</TableCell>
      <TableCell className="font-semibold">
        {formatPeso(b.count * plan.entryPrice)}
      </TableCell>
      <TableCell className="font-mono text-xs">{b.reference}</TableCell>
      <TableCell className="text-muted-foreground">
        {b.submittedAt ? formatDateTime(b.submittedAt) : "—"}
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="hero"
            disabled={busy !== null}
            onClick={() =>
              act(
                `b${b.batchId}`,
                () =>
                  reviewEntry({
                    data: { batchId: b.batchId, action: "confirm" },
                  }),
                (r) => `Confirmed ${r.updated} accounts${engineNote(r)}`,
              )
            }
          >
            <Spin on={busy === `b${b.batchId}`} />
            <Check /> Confirm all
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              act(
                `rb${b.batchId}`,
                () =>
                  reviewEntry({
                    data: { batchId: b.batchId, action: "reject" },
                  }),
                (r) => `Rejected ${r.updated} accounts`,
              )
            }
          >
            <X /> Reject
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function WithdrawalsTab() {
  return (
    <div className="space-y-6">
      <WithdrawalQueue />
      <WithdrawalHistory />
    </div>
  );
}

type HistoryFilter = WithdrawalStatus | "all";

function WithdrawalHistory() {
  const [status, setStatus] = useState<HistoryFilter>("all");
  const { overview } = Route.useLoaderData();
  // Refetch when the queue changes, so approvals and payouts show up here too.
  const key = `${status}|${overview.pendingWithdrawals}|${overview.paidOut}`;
  const [result, setResult] = useState<{
    key: string;
    rows?: Awaited<ReturnType<typeof listWithdrawals>>;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let live = true;
    listWithdrawals({ data: { status } })
      .then((rows) => live && setResult({ key, rows }))
      .catch((err) => live && setResult({ key, error: errorMessage(err) }));
    return () => {
      live = false;
    };
  }, [key, status]);

  const current = result?.key === key ? result : null;
  const rows = current?.rows ?? null;
  const error = current?.error ?? null;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="font-display font-bold">Withdrawal history</h2>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as HistoryFilter)}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["all", "pending", "approved", "paid", "rejected"] as const).map(
              (s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Member</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Send to</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-5">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <Empty cols={6}>{error}</Empty>
          ) : rows === null ? (
            <Empty cols={6}>
              <Loader2 className="mx-auto animate-spin" />
            </Empty>
          ) : rows.length === 0 ? (
            <Empty cols={6}>No withdrawals with this status.</Empty>
          ) : (
            rows.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="pl-5">
                  <p className="font-medium">{w.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{w.username} · {formatDateTime(w.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {w.reference}
                </TableCell>
                <TableCell>
                  <p>{w.account}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.accountName}
                  </p>
                </TableCell>
                <TableCell className="font-semibold">
                  {formatPeso(w.amount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusVariant(w.status)}
                    className="capitalize"
                  >
                    {w.status}
                  </Badge>
                  {w.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {w.note}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="pr-5 text-muted-foreground">
                  {formatDateTime(w.updatedAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function WithdrawalQueue() {
  const { withdrawals } = Route.useLoaderData();
  const { busy, act } = useAction();
  return (
    <div className="surface-card overflow-hidden">
      <h2 className="px-5 pt-5 font-display font-bold">Open requests</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Member</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Send to</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-5 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withdrawals.length === 0 ? (
            <Empty cols={6}>No withdrawals waiting.</Empty>
          ) : (
            withdrawals.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="pl-5">
                  <p className="font-medium">{w.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{w.username} · {formatDateTime(w.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {w.reference}
                </TableCell>
                <TableCell>
                  <p>{w.account}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.accountName}
                  </p>
                </TableCell>
                <TableCell className="font-semibold">
                  {formatPeso(w.amount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={w.status === "pending" ? "warning" : "secondary"}
                    className="capitalize"
                  >
                    {w.status}
                  </Badge>
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end gap-2">
                    {w.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() =>
                          act(
                            `a${w.id}`,
                            () =>
                              reviewWithdrawal({
                                data: { id: w.id, action: "approve" },
                              }),
                            `${w.reference} approved`,
                          )
                        }
                      >
                        <Spin on={busy === `a${w.id}`} /> Approve
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="hero"
                      disabled={busy !== null}
                      onClick={() =>
                        act(
                          `p${w.id}`,
                          () =>
                            reviewWithdrawal({
                              data: { id: w.id, action: "paid" },
                            }),
                          `${w.reference} marked paid`,
                        )
                      }
                    >
                      <Spin on={busy === `p${w.id}`} /> Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => {
                        const note =
                          window.prompt(
                            "Reason for rejecting (shown to the member):",
                          ) ?? undefined;
                        if (note === undefined) return;
                        void act(
                          `r${w.id}`,
                          () =>
                            reviewWithdrawal({
                              data: { id: w.id, action: "reject", note },
                            }),
                          `${w.reference} rejected and refunded`,
                        );
                      }}
                    >
                      <X /> Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MembersTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminMember | null>(null);
  const [adding, setAdding] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      setRows(await searchMembers({ data: { q } }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Username, name, code, mobile or email"
            aria-label="Search members"
            className="w-72 rounded-xl bg-card/70 pl-9"
          />
        </div>
        <Button type="submit" variant="hero" disabled={loading}>
          <Spin on={loading} /> Search
        </Button>
        {rows === null ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => search()}
            disabled={loading}
          >
            Show newest
          </Button>
        ) : null}
        <Button
          type="button"
          variant="gold"
          className="sm:ml-auto"
          onClick={() => setAdding(true)}
        >
          <UserPlus /> Add member
        </Button>
      </form>
      <AddMemberDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={async (username) => {
          setQ(username);
          setRows(await searchMembers({ data: { q: username } }));
        }}
      />
      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Member</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead className="pr-5 text-right">Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <Empty cols={6}>
                Search for a member, or show the newest accounts.
              </Empty>
            ) : rows.length === 0 ? (
              <Empty cols={6}>No members match that search.</Empty>
            ) : (
              rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-5">
                    <p className="font-medium">
                      {m.fullName}{" "}
                      {m.isAdmin ? (
                        <Badge variant="secondary">Admin</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{m.username} · {m.memberCode} · {m.mobile}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.sponsor ? `@${m.sponsor}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        m.entryStatus === "confirmed"
                          ? "success"
                          : m.entryStatus === "pending"
                            ? "warning"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {m.entryStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.isSuspended ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant={m.isActive ? "success" : "secondary"}>
                        {m.isActive ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatPeso(m.balance)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(m)}
                    >
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <MemberDialog
        member={selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          const fresh = await searchMembers({ data: { q } });
          setRows(fresh);
          setSelected((s) =>
            s ? (fresh.find((m) => m.id === s.id) ?? null) : null,
          );
        }}
      />
    </div>
  );
}

const entryStatuses = ["unpaid", "pending", "confirmed", "rejected"] as const;

function AddMemberDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (username: string) => Promise<void>;
}) {
  const { busy, act } = useAction();
  const [confirmEntry, setConfirmEntry] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Creates an account in the next open slot under the sponsor. Leave
            the sponsor blank to place it under the company root.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const get = (k: string) => String(d.get(k) ?? "");
            const r = await act(
              "add",
              () =>
                createMember({
                  data: {
                    fullName: get("fullName"),
                    username: get("username"),
                    email: get("email"),
                    mobile: get("mobile"),
                    city: get("city"),
                    password: get("password"),
                    sponsor: get("sponsor"),
                    confirmEntry,
                  },
                }),
              (r) => `@${r.username} (${r.memberCode}) added${engineNote(r)}`,
            );
            if (r) {
              onClose();
              await onAdded(r.username);
            }
          }}
        >
          <Field id="add-fullName" name="fullName" label="Full name" required />
          <Field id="add-username" name="username" label="Username" required />
          <Field
            id="add-email"
            name="email"
            type="email"
            label="Email (optional)"
          />
          <Field
            id="add-mobile"
            name="mobile"
            label="Mobile"
            placeholder="09xxxxxxxxx"
            required
          />
          <Field id="add-city" name="city" label="City" required />
          <Field
            id="add-password"
            name="password"
            type="text"
            label="Password"
            minLength={6}
            required
          />
          <Field
            id="add-sponsor"
            name="sponsor"
            label="Sponsor username or code (optional)"
            className="sm:col-span-2"
          />
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="add-confirm"
              checked={confirmEntry}
              onCheckedChange={setConfirmEntry}
            />
            <Label htmlFor="add-confirm">Mark entry payment as confirmed</Label>
          </div>
          <Button
            type="submit"
            variant="hero"
            className="sm:col-span-2"
            disabled={busy !== null}
          >
            <Spin on={busy === "add"} /> <UserPlus /> Create account
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberDialog({
  member: m,
  onClose,
  onChanged,
}: {
  member: AdminMember | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { busy, act } = useAction();
  const [deleteUsername, setDeleteUsername] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{
    id: number;
    detail?: MemberDetail;
    error?: string;
  } | null>(null);
  const memberId = m?.id;

  useEffect(() => {
    if (memberId === undefined) return;
    let live = true;
    getMemberDetail({ data: { id: memberId } })
      .then((detail) => live && setLoaded({ id: memberId, detail }))
      .catch(
        (err) => live && setLoaded({ id: memberId, error: errorMessage(err) }),
      );
    return () => {
      live = false;
    };
  }, [memberId, version]);

  // Keeps showing the last details for this member while a refresh loads.
  const detail =
    loaded && loaded.id === memberId ? (loaded.detail ?? null) : null;
  const detailError =
    loaded && loaded.id === memberId ? (loaded.error ?? null) : null;

  async function run<T>(
    key: string,
    task: () => Promise<T>,
    message: string | ((r: T) => string),
  ) {
    const r = await act(key, task, message);
    if (r !== undefined) {
      await onChanged();
      setVersion((v) => v + 1);
    }
    return r;
  }

  return (
    <Dialog
      open={!!m}
      onOpenChange={(o) => {
        if (!o) {
          setResetUrl(null);
          setDeleteUsername("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {m ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {m.fullName}{" "}
                {m.isAdmin ? (
                  <Badge variant="warning">Super admin</Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                @{m.username} · {m.memberCode} · earned {formatPeso(m.earned)} ·
                balance {formatPeso(m.balance)}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="overview">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="edit">Edit details</TabsTrigger>
                <TabsTrigger value="security">Password</TabsTrigger>
                <TabsTrigger value="payout">Payout</TabsTrigger>
                <TabsTrigger value="balance">Balance</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                {!m.isAdmin && (
                  <TabsTrigger value="delete">Delete account</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {m.email ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Mobile:</span>{" "}
                    {m.mobile}
                  </p>
                  <p>
                    <span className="text-muted-foreground">City:</span>{" "}
                    {m.city || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Sponsor:</span>{" "}
                    {m.sponsor ? `@${m.sponsor}` : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Joined:</span>{" "}
                    {formatDateTime(m.createdAt)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Directs:</span>{" "}
                    {detail
                      ? `${detail.paidDirects} paid of ${detail.directs}`
                      : "…"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Paid out:</span>{" "}
                    {detail ? formatPeso(detail.wallet.paidOut) : "…"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">In process:</span>{" "}
                    {detail ? formatPeso(detail.wallet.pendingOut) : "…"}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.entryStatus !== "confirmed" ? (
                    <Button
                      variant="hero"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          "confirm",
                          () =>
                            reviewEntry({
                              data: { memberIds: [m.id], action: "confirm" },
                            }),
                          (r) => `Entry confirmed${engineNote(r)}`,
                        )
                      }
                    >
                      <Spin on={busy === "confirm"} />
                      <Check /> Confirm entry
                    </Button>
                  ) : null}
                  {m.isAdmin ? null : (
                    <Button
                      variant={m.isSuspended ? "hero" : "outline"}
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          "suspend",
                          () =>
                            updateMemberFlags({
                              data: { id: m.id, isSuspended: !m.isSuspended },
                            }),
                          m.isSuspended
                            ? "Account reinstated"
                            : "Account suspended",
                        )
                      }
                    >
                      <Spin on={busy === "suspend"} />
                      {m.isSuspended ? "Reinstate account" : "Suspend account"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={async () => {
                      const r = await act(
                        "reset",
                        () => createPasswordResetLink({ data: { id: m.id } }),
                        "Reset link created",
                      );
                      if (r) setResetUrl(r.url);
                    }}
                  >
                    <KeyRound /> Password reset link
                  </Button>
                </div>
                {resetUrl ? (
                  <div className="space-y-2 rounded-xl bg-secondary/60 p-3 text-xs">
                    <p>
                      Send this one-time link to the member. It works once, for
                      24 hours.
                    </p>
                    <p className="font-mono break-all">{resetUrl}</p>
                    <CopyButton
                      text={resetUrl}
                      label="Copy reset link"
                      toastMessage="Reset link copied"
                      size="sm"
                      variant="outline"
                    />
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="edit" className="mt-4">
                <form
                  key={`${m.id}-${m.username}-${m.entryStatus}`}
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    const get = (k: string) => String(d.get(k) ?? "");
                    void run(
                      "edit",
                      () =>
                        updateMember({
                          data: {
                            id: m.id,
                            fullName: get("fullName"),
                            username: get("username"),
                            email: get("email"),
                            mobile: get("mobile"),
                            city: get("city"),
                            entryReference: get("entryReference"),
                            entryStatus: get(
                              "entryStatus",
                            ) as (typeof entryStatuses)[number],
                          },
                        }),
                      (r) => `Member details saved${engineNote(r)}`,
                    );
                  }}
                >
                  <Field
                    id="edit-fullName"
                    name="fullName"
                    label="Full name"
                    defaultValue={m.fullName}
                    required
                  />
                  <Field
                    id="edit-username"
                    name="username"
                    label="Username"
                    defaultValue={m.username}
                    readOnly={m.isAdmin}
                    required
                  />
                  <Field
                    id="edit-email"
                    name="email"
                    type="email"
                    label="Email"
                    defaultValue={m.email ?? ""}
                    readOnly={m.isAdmin}
                  />
                  <Field
                    id="edit-mobile"
                    name="mobile"
                    label="Mobile"
                    defaultValue={m.mobile}
                    required
                  />
                  <Field
                    id="edit-city"
                    name="city"
                    label="City"
                    defaultValue={m.city}
                    required
                  />
                  <Field
                    id="edit-entryReference"
                    name="entryReference"
                    label="Entry payment reference"
                    defaultValue={m.entryReference ?? ""}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-entryStatus">Entry status</Label>
                    <Select name="entryStatus" defaultValue={m.entryStatus}>
                      <SelectTrigger id="edit-entryStatus" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {entryStatuses.map((s) => (
                          <SelectItem
                            key={s}
                            value={s}
                            className="capitalize"
                            disabled={
                              m.entryStatus === "confirmed" && s !== "confirmed"
                            }
                          >
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {m.isAdmin ? (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      The super admin's username and email are fixed — the
                      console is bound to them.
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    variant="hero"
                    className="sm:col-span-2"
                    disabled={busy !== null}
                  >
                    <Spin on={busy === "edit"} /> Save details
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="security" className="mt-4">
                <form
                  className="grid gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    const r = await run(
                      "password",
                      () =>
                        setMemberPassword({
                          data: {
                            id: m.id,
                            password: String(d.get("password") ?? ""),
                          },
                        }),
                      "Password set — the member was signed out everywhere",
                    );
                    if (r) form.reset();
                  }}
                >
                  <Field
                    id="set-password"
                    name="password"
                    type="text"
                    label="New password"
                    minLength={6}
                    required
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busy !== null}
                  >
                    <Spin on={busy === "password"} /> <KeyRound /> Set password
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="payout" className="mt-4">
                {detail ? (
                  <PayoutForm
                    key={`${m.id}-${version}`}
                    payout={detail.payout}
                    busy={busy}
                    onSave={(data) =>
                      run(
                        "payout",
                        () => saveMemberPayout({ data: { id: m.id, ...data } }),
                        "Payout account saved",
                      )
                    }
                  />
                ) : (
                  <DetailLoading error={detailError} />
                )}
              </TabsContent>

              <TabsContent value="balance" className="mt-4">
                <form
                  className="grid gap-3 sm:grid-cols-[8rem_1fr]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    const amount = Number(d.get("amount"));
                    const r = await run(
                      "adjust",
                      () =>
                        adjustBalance({
                          data: {
                            id: m.id,
                            amount,
                            reason: String(d.get("reason") ?? ""),
                          },
                        }),
                      `Balance adjusted by ${formatPeso(amount)}`,
                    );
                    if (r) form.reset();
                  }}
                >
                  <Field
                    id="adj-amount"
                    name="amount"
                    type="number"
                    step={1}
                    required
                    label="Amount (₱)"
                    placeholder="e.g. 50 or -50"
                  />
                  <Field
                    id="adj-reason"
                    name="reason"
                    required
                    maxLength={120}
                    label="Reason"
                    placeholder="Promo bonus, correction…"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="sm:col-span-2"
                    disabled={busy !== null}
                  >
                    <Spin on={busy === "adjust"} /> Post adjustment
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="delete" className="mt-4 space-y-4">
                <h3 className="font-display font-bold text-destructive">
                  Permanently delete account
                </h3>
                <p className="text-sm text-muted-foreground">
                  This removes the member, login sessions, wallet credits,
                  withdrawal history, payout details, and closed grocery orders.
                  This cannot be undone. Accounts with downline members or
                  referrals cannot be deleted; suspend them instead. Resolve
                  pending payouts and open orders first. Previously earned
                  credits in other accounts remain.
                </p>
                <Label htmlFor="delete-member-username">
                  Type {m.username} to confirm
                </Label>
                <Input
                  id="delete-member-username"
                  autoComplete="off"
                  value={deleteUsername}
                  onChange={(e) => setDeleteUsername(e.target.value)}
                />
                <Button
                  variant="destructive"
                  disabled={busy !== null || deleteUsername !== m.username}
                  onClick={async () => {
                    const result = await act(
                      "delete-member",
                      () =>
                        deleteMember({
                          data: { id: m.id, username: deleteUsername },
                        }),
                      "Member account deleted",
                    );
                    if (result) {
                      setDeleteUsername("");
                      onClose();
                      await onChanged();
                    }
                  }}
                >
                  <Spin on={busy === "delete-member"} />
                  Permanently delete member
                </Button>
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-4">
                {detail ? (
                  <MemberHistory detail={detail} />
                ) : (
                  <DetailLoading error={detailError} />
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailLoading({ error }: { error: string | null }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {error ?? <Loader2 className="mx-auto animate-spin" />}
    </p>
  );
}

type PayoutInput = {
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName?: string;
};

function PayoutForm({
  payout,
  busy,
  onSave,
}: {
  payout: MemberDetail["payout"];
  busy: string | null;
  onSave: (data: PayoutInput) => Promise<unknown>;
}) {
  const [method, setMethod] = useState<PayoutMethod>(payout?.method ?? "GCash");
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void onSave({
          method,
          accountName: String(d.get("accountName") ?? ""),
          accountNumber: String(d.get("accountNumber") ?? ""),
          bankName:
            method === "Bank" ? String(d.get("bankName") ?? "") : undefined,
        });
      }}
    >
      {payout ? null : (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          No payout account saved yet.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="payout-method">Method</Label>
        <Select
          value={method}
          onValueChange={(v) => setMethod(v as PayoutMethod)}
        >
          <SelectTrigger id="payout-method" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["GCash", "Maya", "DigiCash", "Bank"] as const).map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {method === "Bank" ? (
        <Field
          id="payout-bank"
          name="bankName"
          label="Bank name"
          defaultValue={payout?.bankName ?? ""}
          required
        />
      ) : (
        <div className="hidden sm:block" />
      )}
      <Field
        id="payout-name"
        name="accountName"
        label="Account name"
        defaultValue={payout?.accountName ?? ""}
        required
      />
      <Field
        id="payout-number"
        name="accountNumber"
        label="Account / mobile number"
        defaultValue={payout?.accountNumber ?? ""}
        required
      />
      <Button
        type="submit"
        variant="hero"
        className="sm:col-span-2"
        disabled={busy !== null}
      >
        <Spin on={busy === "payout"} /> Save payout account
      </Button>
    </form>
  );
}

function MemberHistory({ detail }: { detail: MemberDetail }) {
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border">
        <h3 className="px-4 pt-3 text-sm font-semibold">Credits</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="pr-4 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.credits.length === 0 ? (
              <Empty cols={3}>No credits yet.</Empty>
            ) : (
              detail.credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">{c.type}</span> ·{" "}
                    {c.description}
                  </TableCell>
                  <TableCell
                    className={`pr-4 text-right font-semibold ${c.amount < 0 ? "text-destructive" : "text-primary"}`}
                  >
                    {formatPeso(c.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <h3 className="px-4 pt-3 text-sm font-semibold">Withdrawals</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.withdrawals.length === 0 ? (
              <Empty cols={4}>No withdrawals yet.</Empty>
            ) : (
              detail.withdrawals.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">
                    {formatDateTime(w.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {w.reference}
                    <p className="font-sans text-muted-foreground">
                      {w.account}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant(w.status)}
                      className="capitalize"
                    >
                      {w.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right font-semibold">
                    {formatPeso(w.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

type ActivationCode = AdminData["codes"][number];
type CodeFilter = "all" | ActivationCode["status"];

const codeFilters: Array<[CodeFilter, string]> = [
  ["unused", "Available"],
  ["used", "Redeemed"],
  ["void", "Cancelled"],
  ["all", "All"],
];

function codeBadge(status: ActivationCode["status"]) {
  return status === "unused" ? (
    <Badge variant="success">Available</Badge>
  ) : status === "used" ? (
    <Badge variant="secondary">Redeemed</Badge>
  ) : (
    <Badge variant="destructive">Cancelled</Badge>
  );
}

function downloadCodes(codes: string[], name: string) {
  const url = URL.createObjectURL(
    new Blob([codes.join("\n") + "\n"], { type: "text/plain" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function CodesTab() {
  const { codes, codeCounts: counts } = Route.useLoaderData();
  const { busy, act } = useAction();
  const [filter, setFilter] = useState<CodeFilter>("unused");
  const [quantity, setQuantity] = useState("1");
  const [selected, setSelected] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<"selected" | "all" | null>(null);
  const [query, setQuery] = useState("");
  const [fresh, setFresh] = useState<{
    batchId: string;
    codes: string[];
  } | null>(null);
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const q = query.trim().toLowerCase();
  const rows = codes.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (!q ||
        [c.code, c.note, c.batchId, c.usedBy, c.usedByName]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))),
  );
  const unusedShown = rows.filter((c) => c.status === "unused");

  return (
    <div className="space-y-4">
      <form
        className="surface-card grid gap-4 p-5 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const form = e.currentTarget;
          const res = await act(
            "generate",
            () =>
              generateActivationCodes({
                data: {
                  count: Number(d.get("count")),
                  note: String(d.get("note") ?? ""),
                },
              }),
            (r) =>
              `Generated ${r.codes.length.toLocaleString("en-PH")} activation ${r.codes.length === 1 ? "code" : "codes"}`,
          );
          if (res) {
            setFresh(res);
            setFilter("unused");
            form.reset();
          }
        }}
      >
        <div className="sm:col-span-3">
          <h2 className="font-display font-bold">Generate activation codes</h2>
          <p className="text-xs text-muted-foreground">
            Every sign-up — the public sign-up page and each account placed in
            the genealogy — must redeem one code. A redeemed code counts as the
            paid entry, so the account is confirmed and credits post right away.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="code-quantity">Generate codes for</Label>
          <select
            id="code-quantity"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          >
            {[1, 3, 7, 15, 31, 63, 127, 255, 511, 1023].map((n) => (
              <option key={n} value={String(n)}>
                {n.toLocaleString("en-PH")} {n === 1 ? "Account" : "Accounts"}
              </option>
            ))}
            <option value="custom">Custom quantity</option>
          </select>
          {quantity === "custom" ? (
            <Field
              label="Custom quantity (1–1,023)"
              id="code-count"
              name="count"
              type="number"
              min={1}
              max={1023}
              step={1}
              required
            />
          ) : (
            <input type="hidden" name="count" value={quantity} />
          )}
        </div>
        <Field
          label="Note (optional)"
          id="code-note"
          name="note"
          maxLength={80}
          placeholder="e.g. Paid via GCash — Juan's team"
        />
        <Button type="submit" variant="hero" disabled={busy !== null}>
          <Spin on={busy === "generate"} />
          <Ticket /> Generate codes
        </Button>
        {fresh ? (
          <div className="space-y-3 rounded-xl bg-secondary/60 p-4 text-xs sm:col-span-3">
            <p className="font-semibold text-foreground">
              New batch {fresh.batchId} ·{" "}
              {fresh.codes.length.toLocaleString("en-PH")} codes
            </p>
            <Textarea
              readOnly
              rows={Math.min(8, fresh.codes.length)}
              value={fresh.codes.join("\n")}
              aria-label="Generated activation codes"
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <CopyButton
                text={fresh.codes.join("\n")}
                label="Copy all"
                toastMessage="Codes copied"
                size="sm"
                variant="outline"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => downloadCodes(fresh.codes, fresh.batchId)}
              >
                Download .txt
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFresh(null)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter activation codes"
          >
            {codeFilters.map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "hero" : "outline"}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} (
                {(value === "all"
                  ? total
                  : (counts[value] ?? 0)
                ).toLocaleString("en-PH")}
                )
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Code, note or member"
                aria-label="Search activation codes"
                className="w-56 rounded-xl pl-9"
              />
            </div>
            {unusedShown.length ? (
              <CopyButton
                text={unusedShown.map((c) => c.code).join("\n")}
                label={`Copy ${unusedShown.length.toLocaleString("en-PH")} available`}
                toastMessage="Available codes copied"
                size="sm"
                variant="outline"
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={
                rows.length > 0 && rows.every((c) => selected.includes(c.id))
              }
              onChange={(e) =>
                setSelected(e.target.checked ? rows.map((c) => c.id) : [])
              }
            />
            Select all displayed codes
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected.length || busy !== null}
            onClick={() => setDeleting("selected")}
          >
            Delete selected ({selected.length})
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!total || busy !== null}
            onClick={() => setDeleting("all")}
          >
            Delete all codes ({total.toLocaleString("en-PH")})
          </Button>
        </div>
        <Dialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open && busy === null) setDeleting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Delete{" "}
                {deleting === "all" ? "all activation codes" : "selected codes"}
                ?
              </DialogTitle>
              <DialogDescription>
                This permanently deletes{" "}
                {deleting === "all"
                  ? `all ${total.toLocaleString("en-PH")} codes, including codes outside the displayed list`
                  : `${selected.length} selected codes`}
                . Deleted unused codes cannot be redeemed. Existing member
                accounts and credits stay intact; redeemed-code tracking is
                removed for deleted codes.
              </DialogDescription>
            </DialogHeader>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => setDeleting(null)}
            >
              Keep codes
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={async () => {
                const result = await act(
                  "delete-codes",
                  () =>
                    deleteActivationCodes({
                      data: { all: deleting === "all", ids: selected },
                    }),
                  (r) => `Deleted ${r.deleted} codes`,
                );
                if (result) {
                  setSelected([]);
                  setFresh(null);
                  setDeleting(null);
                }
              }}
            >
              Permanently delete
            </Button>
          </DialogContent>
        </Dialog>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Select</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Batch / note</TableHead>
              <TableHead>Redeemed by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="pr-5 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <Empty cols={7}>
                {total === 0
                  ? "No activation codes yet — generate a batch above."
                  : "No codes in this list."}
              </Empty>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.code}`}
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="font-mono font-semibold">
                    {c.code}
                  </TableCell>
                  <TableCell>{codeBadge(c.status)}</TableCell>
                  <TableCell className="text-xs">
                    <p className="font-mono">{c.batchId}</p>
                    {c.note ? (
                      <p className="text-muted-foreground">{c.note}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.usedBy ? (
                      <>
                        <p className="font-medium">{c.usedByName}</p>
                        <p className="text-muted-foreground">
                          @{c.usedBy}
                          {c.sponsor ? ` · sponsor @${c.sponsor}` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(c.usedAt ?? c.createdAt)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-2">
                      {c.status === "unused" ? (
                        <>
                          <CopyButton
                            text={c.code}
                            label="Copy"
                            toastMessage={`${c.code} copied`}
                            size="sm"
                            variant="outline"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() =>
                              act(
                                `void${c.id}`,
                                () =>
                                  voidActivationCodes({
                                    data: { ids: [c.id] },
                                  }),
                                `${c.code} cancelled`,
                              )
                            }
                          >
                            <Spin on={busy === `void${c.id}`} />
                            <X /> Cancel
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {codes.length >= 2000 ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            Showing the latest 2,000 codes.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CreditsTab() {
  const { ledger } = Route.useLoaderData();
  return (
    <div className="surface-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Date</TableHead>
            <TableHead>Member</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="pr-5 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledger.length === 0 ? (
            <Empty cols={5}>No credits have been posted yet.</Empty>
          ) : (
            ledger.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="pl-5 text-muted-foreground">
                  {formatDateTime(c.createdAt)}
                </TableCell>
                <TableCell>@{c.username}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      c.type === "matching"
                        ? "warning"
                        : c.type === "active"
                          ? "success"
                          : "secondary"
                    }
                    className="capitalize"
                  >
                    {c.type}
                  </Badge>
                </TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell
                  className={`pr-5 text-right font-semibold ${c.amount < 0 ? "text-destructive" : "text-primary"}`}
                >
                  {formatPeso(c.amount)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PasswordHelpTab() {
  const { resets } = Route.useLoaderData();
  const { busy, act } = useAction();
  const [links, setLinks] = useState<Record<number, string>>({});
  return (
    <div className="surface-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Member</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead className="pr-5 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resets.length === 0 && Object.keys(links).length === 0 ? (
            <Empty cols={3}>No password help requests.</Empty>
          ) : (
            resets.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <p className="font-medium">{r.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    @{r.username} · {r.mobile}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(r.requestedAt)}
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="hero"
                      disabled={busy !== null}
                      onClick={async () => {
                        const res = await act(
                          `l${r.id}`,
                          () => createPasswordResetLink({ data: { id: r.id } }),
                          "Reset link created — copy it below",
                        );
                        if (res) setLinks((l) => ({ ...l, [r.id]: res.url }));
                      }}
                    >
                      <Spin on={busy === `l${r.id}`} />
                      <KeyRound /> Create link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() =>
                        act(
                          `d${r.id}`,
                          () => dismissPasswordHelp({ data: { id: r.id } }),
                          "Request dismissed",
                        )
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {Object.entries(links).map(([id, url]) => (
        <div
          key={id}
          className="m-5 space-y-2 rounded-xl bg-secondary/60 p-3 text-xs"
        >
          <p>
            One-time reset link (24 hours) — send it to the member by SMS or
            Messenger:
          </p>
          <p className="font-mono break-all">{url}</p>
          <CopyButton
            text={url}
            label="Copy reset link"
            toastMessage="Reset link copied"
            size="sm"
            variant="outline"
          />
        </div>
      ))}
    </div>
  );
}

const planFields: Array<[keyof Omit<Plan, "paymentInstructions">, string]> = [
  ["entryPrice", "Entry price (₱)"],
  ["requiredDirects", "Paid directs to activate"],
  ["perActiveAccount", "Credit per active account (₱)"],
  ["earningCap", "Active-account earning cap (₱)"],
  ["matchingBonus", "Matching bonus per pair (₱)"],
  ["matchingLevels", "Matching levels"],
  ["dailyWithdrawalLimit", "Daily withdrawal limit (₱)"],
  ["minWithdrawal", "Minimum withdrawal (₱)"],
];

function SettingsTab() {
  const { plan } = Route.useLoaderData();
  const { busy, act } = useAction();
  return (
    <form
      className="surface-card grid gap-4 p-6 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const data = Object.fromEntries(
          planFields.map(([k]) => [k, Number(d.get(k))]),
        ) as Omit<Plan, "paymentInstructions">;
        void act(
          "plan",
          () =>
            savePlanSettings({
              data: {
                ...data,
                paymentInstructions: String(d.get("paymentInstructions") ?? ""),
              },
            }),
          (r) => `Plan settings saved${engineNote(r)}`,
        );
      }}
    >
      {planFields.map(([key, label]) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`plan-${key}`}>{label}</Label>
          <Input
            id={`plan-${key}`}
            name={key}
            type="number"
            min={0}
            step={1}
            required
            defaultValue={plan[key]}
            className="rounded-xl"
          />
        </div>
      ))}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="plan-paymentInstructions">
          Payment instructions (shown to unpaid members)
        </Label>
        <Textarea
          id="plan-paymentInstructions"
          name="paymentInstructions"
          rows={4}
          required
          defaultValue={plan.paymentInstructions}
          placeholder="GCash: 09xx xxx xxxx (1MERCADO Shopping) · BDO: 0000-0000-00…"
        />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Changes apply to new credits and requests right away. Credits already
        posted are not recalculated.
      </p>
      <div className="sm:col-span-2">
        <Button type="submit" variant="hero" disabled={busy !== null}>
          <Spin on={busy === "plan"} /> Save plan settings
        </Button>
      </div>
    </form>
  );
}

const adminPulse = () => getAdminPulse();

/** Live status pill: the console re-syncs whenever members act on their dashboards. */
function LiveIndicator({
  syncedAt,
  online,
}: {
  syncedAt: Date | null;
  online: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs"
      role="status"
    >
      <span className="relative flex size-2">
        {online ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
        ) : null}
        <span
          className={`relative inline-flex size-2 rounded-full ${online ? "bg-success" : "bg-destructive"}`}
        />
      </span>
      {online ? "Live" : "Reconnecting…"}
      {syncedAt ? (
        <span className="text-muted-foreground">
          · synced{" "}
          {syncedAt.toLocaleTimeString("en-PH", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ) : null}
    </span>
  );
}

function AdminConsole() {
  const { overview: o, resets, codeCounts } = Route.useLoaderData();
  const { tab = "entries" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { syncedAt, online } = useLiveSync(adminPulse, {
    interval: 60_000,
    onChange: (prev, next) => {
      const redeemed = next.usedCodes - prev.usedCodes;
      if (redeemed > 0)
        toast.success(
          `${redeemed.toLocaleString("en-PH")} activation ${redeemed === 1 ? "code" : "codes"} redeemed — new ${redeemed === 1 ? "account" : "accounts"} confirmed`,
          {
            action: {
              label: "View",
              onClick: () =>
                navigate({ search: { tab: "codes" }, replace: true }),
            },
          },
        );
      const entries = next.pendingEntries - prev.pendingEntries;
      if (entries > 0)
        toast.info(
          `${entries} new ${entries === 1 ? "registration" : "registrations"} awaiting review`,
          {
            action: {
              label: "Review",
              onClick: () =>
                navigate({ search: { tab: "entries" }, replace: true }),
            },
          },
        );
      const payouts = next.pendingWithdrawals - prev.pendingWithdrawals;
      if (payouts > 0)
        toast.info(
          `${payouts} new withdrawal ${payouts === 1 ? "request" : "requests"}`,
        );
    },
  });
  return (
    <>
      <PageHeader
        title="Super Admin Console"
        subtitle="Approve entries and payouts, add and edit members, and control the plan."
        actions={<LiveIndicator syncedAt={syncedAt} online={online} />}
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members"
          value={o.members.toLocaleString("en-PH")}
          hint={`${o.active.toLocaleString("en-PH")} active`}
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Entries to review"
          value={o.pendingEntries.toLocaleString("en-PH")}
          hint={`${(codeCounts.unused ?? 0).toLocaleString("en-PH")} activation codes available · ${(codeCounts.used ?? 0).toLocaleString("en-PH")} redeemed`}
          icon={UserCheck}
        />
        <StatCard
          label="Total credited"
          value={formatPeso(o.credited)}
          icon={Coins}
          tone="gold"
        />
        <StatCard
          label="Paid out"
          value={formatPeso(o.paidOut)}
          hint={`${formatPeso(o.awaitingPayout)} in ${o.pendingWithdrawals} open requests`}
          icon={Banknote}
        />
      </section>
      <Tabs
        value={tab}
        onValueChange={(next) =>
          navigate({ search: { tab: next as AdminTab }, replace: true })
        }
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="entries">
            Registrations {o.pendingEntries ? `(${o.pendingEntries})` : ""}
          </TabsTrigger>
          <TabsTrigger value="withdrawals">
            Withdrawals{" "}
            {o.pendingWithdrawals ? `(${o.pendingWithdrawals})` : ""}
          </TabsTrigger>
          <TabsTrigger value="codes">
            Activation codes {codeCounts.unused ? `(${codeCounts.unused})` : ""}
          </TabsTrigger>
          <TabsTrigger value="catalog">Groceries & orders</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="credits">Credits ledger</TabsTrigger>
          <TabsTrigger value="passwords">
            Password help {resets.length ? `(${resets.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="settings">Plan settings</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="mt-4">
          <EntriesTab />
        </TabsContent>
        <TabsContent value="withdrawals" className="mt-4">
          <WithdrawalsTab />
        </TabsContent>
        <TabsContent value="codes" className="mt-4">
          <CodesTab />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <div className="surface-card space-y-3 p-6">
            <h2 className="font-display text-lg font-bold">
              Grocery products & orders
            </h2>
            <p className="text-sm text-muted-foreground">
              Add and edit grocery products, set prices and availability, and
              review customer orders in the catalog.
            </p>
            <Button asChild>
              <Link to="/catalog">Manage groceries & orders</Link>
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>
        <TabsContent value="credits" className="mt-4">
          <CreditsTab />
        </TabsContent>
        <TabsContent value="passwords" className="mt-4">
          <PasswordHelpTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
