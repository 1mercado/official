# 1MERCADO Shopping — Product Roadmap

1MERCADO Shopping is a member rewards platform. Members pay a one-time entry, invite others, earn credits for active accounts in their line, and request payouts that admins review and release.

## Milestone 1 — Product surface ✅

Branded landing page, sign-in / sign-up, password reset, and the member app shell, plus Dashboard, Binary Genealogy, My Network, Earnings, Wallet & Withdrawals, and Compensation Plan. All screens read sample data from `src/lib/fixtures.ts` and plan settings from `src/lib/plan.ts`. An animated abstract gradient backdrop sits behind every page.

## Milestone 2 — Data model (Netlify Database + Drizzle) ✅

Tables: `members` (profile, member code, referrer, binary parent + side, entry status/reference, active flag, admin role), `credits` (type: active / matching / adjustment, source, amount), `withdrawals` (amount, account, reference, status), `plan_settings` (single row backing `plan.ts`), `payout_accounts`. Replace the fixtures with server functions one screen at a time.

## Milestone 3 — Accounts (Netlify Identity) ✅

Wire `/auth` sign-up/sign-in/forgot-password and `/reset-password` to `@netlify/identity`. Create the member row on sign-up, honour `?ref=` referrer codes, enforce unique usernames, and protect the `/_app` layout routes. Admin role via Identity roles.

## Milestone 4 — Entry payments & activation ✅

Members submit their GCash/Maya/bank reference; admins confirm or reject. A member becomes active after the required paid direct referrals. Binary placement: first two referrals fill left/right; the genealogy "Open position" form registers and places a member directly.

## Milestone 5 — Earnings engine ✅

On activation, credit ₱10 to every account in the line (respecting the ₱5,000 cap) and compute ₱100 matching bonuses for left+right active pairs up to 10 levels. Make it transactional and idempotent.

## Milestone 6 — Wallet & withdrawals ✅

Server-validated requests (balance, minimum, ₱50,000 daily limit), status flow pending → approved → paid / rejected, and refund on rejection.

## Milestone 7 — Profile & Payouts ✅

Edit profile details, change password, and manage the GCash / Maya / bank payout account.

## Milestone 8 — Marketing Materials ✅

Downloadable posters (square and vertical), the logo, and copy-ready scripts (Facebook/Instagram post, Messenger/Viber/SMS message, TikTok/Reels caption, live-selling script, follow-ups, Q&A replies, presentation invite, welcome message), each with the member's referral link filled in.

## Milestone 9 — Admin Console ✅

Overview stats (members, active, total credited, paid out), queues for entry confirmations and withdrawals (confirm / reject / approve / mark paid), member search with activate/deactivate and balance adjustments, a credits ledger, and plan settings editing (prices, caps, limits, payment instructions).
