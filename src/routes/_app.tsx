import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useLiveSync } from "@/hooks/use-live-sync";
import { getMemberPulse } from "@/server/member.functions";
import { getSession } from "@/server/session.functions";

/** Pathless layout for member screens: requires a signed-in session. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/auth", search: { mode: "signin" } });
    return { session };
  },
  loader: ({ context }) => context.session,
  component: AppLayout,
});

const pulse = () => getMemberPulse();

function AppLayout() {
  // Keeps the member's screens bound to admin decisions (entry review, credits, payouts).
  useLiveSync(pulse, {
    interval: 60_000,
    onChange: (prev, next) => {
      if (prev.entryStatus === next.entryStatus) return;
      if (next.entryStatus === "confirmed")
        toast.success("Your entry payment was approved — welcome aboard!");
      else if (next.entryStatus === "rejected")
        toast.error("Your entry payment was declined. Please resubmit.");
    },
  });
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
