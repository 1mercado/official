import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Users,
  Wallet,
  Banknote,
  Phone,
  Scale,
} from "lucide-react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { formatPeso, type Plan } from "@/lib/plan";
import { getPublicInfo } from "@/server/session.functions";

export const Route = createFileRoute("/")({
  loader: () => getPublicInfo(),
  component: Landing,
});

const disclaimer = [
  {
    title: "Membership means shopping",
    text: "Every 1 Mercado member is simply a customer who shops for groceries and everyday essentials for personal or family use. Signing up is a way to buy what your household already needs — it is not a job, not a business you are required to build, and not a way to get rich.",
  },
  {
    title: "Rewards are bonuses only",
    text: "Points, vouchers, cashback, gifts, and any other rewards are bonuses and thank-you gestures for shopping with us. They are not income, salary, wages, commissions, dividends, interest, or a return on investment. Rewards may be changed, limited, expired, or cancelled at any time, and they are never promised.",
  },
  {
    title: "No income is guaranteed",
    text: "1 Mercado does not promise, guarantee, or imply that joining will earn you money. No one should sign up, pay a fee, borrow money, or spend beyond their means expecting to make income. If anyone tells you that earnings are guaranteed, passive, automatic, or guaranteed to grow, that person is not speaking for 1 Mercado.",
  },
  {
    title: "Income comes from sales and direct selling only",
    text: "Where income does exist, it comes from actually selling products and services to real customers through direct selling — not from joining, not from a package, and not from recruiting people. What you earn depends entirely on your own time, effort, and the real sales you make to customers who want the goods.",
  },
  {
    title: "This is not an investment scheme",
    text: "Membership, shopping packages, and rewards are not investments, deposits, securities, franchises, or profit-sharing agreements, and nothing here is an offer of any financial product. Money you spend goes toward goods and services you receive — it is not capital placed to earn a return.",
  },
];

const highlights = (plan: Plan) => [
  {
    icon: Wallet,
    title: `${formatPeso(plan.entryPrice)} one-time entry`,
    text: "A single payment through GCash, Maya, or bank transfer — no monthly fees.",
  },
  {
    icon: Users,
    title: `${plan.requiredDirects} direct referrals`,
    text: `Invite ${plan.requiredDirects} members who complete their entry and your account goes active.`,
  },
  {
    icon: BadgeCheck,
    title: `${formatPeso(plan.perActiveAccount)} per active account`,
    text: `Get credited for each active account in your line, up to ${formatPeso(plan.earningCap)}.`,
  },
  {
    icon: Banknote,
    title: `${formatPeso(plan.dailyWithdrawalLimit)} daily withdrawals`,
    text: "Cash out whenever you like — every request is checked and released by our team.",
  },
];

const categoryImages = [
  { src: "/images/category-pantry.jpg", alt: "Rice and pantry essentials" },
  { src: "/images/category-canned.jpg", alt: "Canned goods and packaged food" },
  {
    src: "/images/category-beverages.jpg",
    alt: "Coffee and everyday beverages",
  },
  {
    src: "/images/category-household.jpg",
    alt: "Household and personal care essentials",
  },
];

function Landing() {
  const { plan, signedIn } = Route.useLoaderData();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
        <Brand />
        {signedIn ? (
          <Button variant="hero" asChild>
            <Link to="/dashboard">Open dashboard</Link>
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button variant="hero" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>
                Join now
              </Link>
            </Button>
          </div>
        )}
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-24">
        <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="lp-rise text-xs font-semibold tracking-[0.25em] text-primary uppercase">
              All in One Supermarket for the Masses
            </p>
            <h1
              className="lp-rise mt-4 font-display text-4xl font-bold tracking-tight sm:text-6xl"
              style={{ animationDelay: "120ms" }}
            >
              Shop, refer, and{" "}
              <span className="text-gradient-brand">earn every day</span>
            </h1>
            <p
              className="lp-rise mt-5 max-w-xl text-muted-foreground"
              style={{ animationDelay: "240ms" }}
            >
              With the 1MERCADO Shopping plan you receive{" "}
              {formatPeso(plan.perActiveAccount)} for each active account in
              your line — and you can follow every peso from a single dashboard.
            </p>
            <div
              className="lp-rise mt-8 flex flex-wrap gap-3"
              style={{ animationDelay: "360ms" }}
            >
              <Button variant="hero" size="lg" asChild>
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create my account <ArrowRight />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="bg-background"
                asChild
              >
                <Link to="/auth">I already have an account</Link>
              </Button>
            </div>
          </div>
          <div
            className="grid grid-cols-2 gap-4"
            aria-label="Everyday essentials"
          >
            {categoryImages.map(({ src, alt }, i) => (
              <div
                key={src}
                className="lp-rise surface-card overflow-hidden"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                <img
                  src={src}
                  alt={alt}
                  width={816}
                  height={816}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  className="aspect-square w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>

        <section
          aria-label="Membership highlights"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {highlights(plan).map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className="lp-rise surface-card p-5"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 font-display font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>

        <section
          id="legal-disclaimer"
          aria-labelledby="disclaimer-title"
          className="surface-card mt-16 p-6 sm:p-10"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gold-gradient text-gold-foreground">
              <Scale className="size-5" />
            </span>
            <h2
              id="disclaimer-title"
              className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Legal disclaimer
            </h2>
          </div>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Please read this before you sign up, buy a package, or hand over any
            money. It explains in plain words what membership is, what rewards
            are, and where income can and cannot come from.
          </p>

          <div className="mt-6 rounded-2xl border border-primary/30 bg-secondary/60 p-5">
            <h3 className="font-display font-bold">The short version</h3>
            <p className="mt-1 text-sm">
              Members shop for groceries. Rewards are bonuses, not income.
              Income, where it exists, comes from sales and direct selling —
              never from joining, paying a fee, or recruiting people.
            </p>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {disclaimer.map(({ title, text }) => (
              <div key={title}>
                <h3 className="font-display font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
            <div>
              <h3 className="font-display font-bold">
                Questions? Ask us first
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Before you join, buy a package, or hand over any money, make
                sure you understand what you are paying for. If anything about
                membership, rewards, or earnings is unclear, call or text{" "}
                <a
                  href="tel:+639554222425"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  0955 4222 425
                </a>{" "}
                and ask us directly.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-border/60 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl">
              This disclaimer is for information only and does not replace your
              own judgement. Terms, rewards, and promotions may change, so check
              the latest version before you commit. Last updated 20 October
              2026.
            </p>
            <a
              href="tel:+639554222425"
              className="inline-flex shrink-0 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
            >
              <Phone className="size-3.5" /> Call or text 0955 4222 425
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
