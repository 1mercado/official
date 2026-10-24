# 1MERCADO Shopping

A member rewards web app for the 1MERCADO "All in One Supermarket for the Masses" plan. Members join with a one-time ₱1,998 entry, invite two direct referrals to go active, earn ₱10 for every active account in their line (up to ₱5,000) plus matching bonuses, and withdraw up to ₱50,000 a day.

## What's live

- **Landing page** (`/`) — hero, animated 3D cart visual, tilt cards with the plan highlights
- **Sign in / Create account** (`/auth`, `?mode=signup&ref=CODE`) and **Reset password** (`/reset-password`)
- **Dashboard** — stats, entry-payment card, latest credits, income-cap progress, referral link
- **Binary Genealogy** — left/right tree with "Open position" registration
- **My Network** — searchable downline table
- **Earnings** — credit ledger with totals
- **Wallet & Withdrawals** — balance card, withdrawal requests, history
- **Compensation Plan** — rules of the plan

A fixed, animated abstract gradient backdrop (`src/components/gradient-backdrop.tsx`) sits behind every page.

Member screens currently use sample data from `src/lib/fixtures.ts`; plan numbers live in `src/lib/plan.ts`.

## Tech

TanStack Start (React 19, TanStack Router), Vite, Tailwind CSS 4, shadcn/ui (Radix), lucide-react, sonner, zod — deployed on Netlify.

## Run locally

```bash
pnpm install
netlify dev --port 8889   # or: pnpm dev
```

## Roadmap

See [PLAN.md](./PLAN.md): database, accounts, entry payments and activation, the earnings engine, real withdrawals, profile & payouts, marketing materials, and the admin console.
