import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/utils";
import { signupSchema } from "@/lib/signup";
import {
  getPublicInfo,
  requestPasswordHelp,
  signIn,
  signUp,
} from "@/server/session.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional(),
  ref: z.string().optional(),
  code: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const info = await getPublicInfo();
    if (info.signedIn) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Sign in · 1MERCADO Shopping" }] }),
  component: AuthPage,
});

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        required
        className="h-11 rounded-xl bg-background/70"
        {...props}
      />
    </div>
  );
}

function AuthPage() {
  const { mode = "signin", ref, code } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  function setMode(next: "signin" | "signup" | "forgot") {
    setResetSent(false);
    void navigate({ to: "/auth", search: { mode: next, ref, code } });
  }

  async function finish(message: string) {
    toast.success(message);
    await router.invalidate();
    await navigate({ to: "/dashboard" });
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    const parsed = signupSchema.safeParse({
      fullName: form.full_name,
      username: form.username,
      mobile: form.mobile,
      email: form.email,
      city: form.city,
      referrerCode: form.referrer_code || undefined,
      activationCode: form.activation_code || undefined,
      membershipConsent: form.membership_consent === "on",
      password: form.password,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    void run(async () => {
      await signUp({ data: parsed.data });
      await finish("Account created and activated — welcome to 1MERCADO!");
    });
  }

  function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!identifier || !password) {
      toast.error("Enter your username or email and password");
      return;
    }
    void run(async () => {
      await signIn({ data: { identifier, password } });
      await finish("Welcome back!");
    });
  }

  function onForgot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const identifier = String(
      new FormData(e.currentTarget).get("identifier") ?? "",
    ).trim();
    if (identifier.length < 3) {
      toast.error("Enter your username, email or mobile number");
      return;
    }
    void run(async () => {
      await requestPasswordHelp({ data: { identifier } });
      setResetSent(true);
    });
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.72_0.16_152/.9),transparent_55%),radial-gradient(circle_at_80%_70%,oklch(0.82_0.15_85/.85),transparent_55%),linear-gradient(160deg,oklch(0.35_0.09_160),oklch(0.22_0.05_165))]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <Link
            to="/"
            className="absolute top-12 left-12 rounded-3xl bg-white/90 p-4 shadow-soft"
          >
            <BrandMark className="size-40" />
          </Link>
          <p className="text-xs font-semibold tracking-[0.25em] text-white/70 uppercase">
            1MERCADO Shopping
          </p>
          <h2 className="mt-3 max-w-md font-display text-4xl font-bold">
            Everyday groceries. Everyday rewards.
          </h2>
          <p className="mt-3 max-w-sm text-white/80">
            Build your line, follow your credits, and request payouts — all from
            one place.
          </p>
        </div>
      </aside>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="surface-card w-full max-w-md p-7 sm:p-8">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <span className="font-display text-lg font-bold">1MERCADO</span>
          </Link>

          {isForgot ? (
            resetSent ? (
              <div className="mt-8 space-y-3">
                <h1 className="font-display text-2xl font-bold">
                  Request received
                </h1>
                <p className="text-sm text-muted-foreground">
                  If that account has a registered email, a one-time password
                  reset link is sent there automatically. Each link works for 24
                  hours.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setMode("signin")}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <h1 className="mt-8 font-display text-2xl font-bold">
                  Forgot your password?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your username, email or mobile to receive a reset link
                  at your registered email. No admin approval is needed.
                </p>
                <form
                  key="forgot"
                  onSubmit={onForgot}
                  className="mt-6 space-y-4"
                >
                  <Field
                    id="identifier"
                    label="Username, email or mobile"
                    autoComplete="username"
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    className="h-11 w-full"
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    Request reset link
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-primary"
                    onClick={() => setMode("signin")}
                  >
                    Back to sign in
                  </button>
                </form>
              </>
            )
          ) : (
            <>
              <h1 className="mt-8 font-display text-2xl font-bold">
                {isSignup ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSignup
                  ? "Join the 1MERCADO Shopping rewards plan in a minute."
                  : "Sign in to open your Shopping dashboard."}
              </p>

              {isSignup ? (
                <form
                  key="signup"
                  onSubmit={onSignUp}
                  className="mt-6 space-y-4"
                >
                  <Field id="full_name" label="Full name" autoComplete="name" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="username"
                      label="Username"
                      autoComplete="username"
                    />
                    <Field
                      id="mobile"
                      label="Mobile (09…)"
                      type="tel"
                      autoComplete="tel"
                    />
                  </div>
                  <Field
                    id="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="city" label="City" />
                    <Field
                      id="referrer_code"
                      label="Referrer code (optional)"
                      required={false}
                      defaultValue={ref}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Field
                      id="activation_code"
                      label="Activation code"
                      defaultValue={code}
                      autoComplete="off"
                      maxLength={30}
                      placeholder="1M-XXXX-XXXX"
                      className="h-11 rounded-xl bg-background/70 font-mono uppercase"
                      aria-describedby="activation_code-help"
                    />
                    <p
                      id="activation_code-help"
                      className="text-xs text-muted-foreground"
                    >
                      Get your one-time code generated in the Admin Console. It
                      pays your entry, so your account is confirmed right away.
                    </p>
                  </div>
                  <Field
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                  />
                  <label className="flex items-start gap-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      name="membership_consent"
                      required
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      I am 18 years old or above and I agree to 1 Mercado
                      Membership Terms and Income Disclosure and I understand I
                      will not be paid for recruiting. I consent to the
                      processing of my personal data as described in the Privacy
                      Notice (Data Privacy Act, RA 10173).
                    </span>
                  </label>
                  <Button
                    type="submit"
                    variant="hero"
                    className="h-11 w-full"
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    Create account
                  </Button>
                </form>
              ) : (
                <form
                  key="signin"
                  onSubmit={onSignIn}
                  className="mt-6 space-y-4"
                >
                  <Field
                    id="identifier"
                    label="Username or email"
                    autoComplete="username"
                  />
                  <Field
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    className="h-11 w-full"
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    Sign in
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-primary"
                    onClick={() => setMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </form>
              )}

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignup ? "Already a member? " : "New to 1MERCADO? "}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => setMode(isSignup ? "signin" : "signup")}
                >
                  {isSignup ? "Sign in" : "Create an account"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
