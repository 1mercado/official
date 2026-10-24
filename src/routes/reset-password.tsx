import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/utils";
import { resetPassword } from "@/server/session.functions";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({ meta: [{ title: "Reset password · 1MERCADO" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="surface-card w-full max-w-sm space-y-4 p-7">
          <BrandMark className="size-10" />
          <h1 className="font-display text-2xl font-bold">Reset link needed</h1>
          <p className="text-sm text-muted-foreground">
            Open the one-time link sent to your registered email, or request a
            new one.
          </p>
          <Button variant="hero" className="h-11 w-full" asChild>
            <Link to="/auth" search={{ mode: "forgot" }}>
              Request a reset link
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form
        className="surface-card w-full max-w-sm space-y-4 p-7"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const password = String(data.get("password") ?? "");
          if (password.length < 6)
            return toast.error("Password needs at least 6 characters");
          if (password !== data.get("confirm"))
            return toast.error("The two passwords do not match");
          setBusy(true);
          try {
            await resetPassword({ data: { token, password } });
            toast.success("Password updated — you are signed in");
            await router.invalidate();
            await navigate({ to: "/dashboard" });
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <BrandMark className="size-10" />
        <h1 className="font-display text-2xl font-bold">Set a new password</h1>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Repeat new password</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          variant="hero"
          className="h-11 w-full"
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </div>
  );
}
