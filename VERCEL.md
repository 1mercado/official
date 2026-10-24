# Vercel deployment preparation

The hosting configuration supports TanStack Start on Vercel using Nitro's Vercel preset. This emits Vercel Build Output with server rendering and server functions; the application must not be deployed as a static SPA.

## Status: database migration remains blocked

This is hosting preparation, not a completed migration away from Netlify. All member accounts, sessions, referral relationships, credits, withdrawals, activation codes, and plan settings still use Netlify Database through `db/index.ts`. The current development environment requires persistent storage to stay on Netlify and cannot implement a replacement database service.

Do not disable the existing production site or database. Without a supported database connection, authenticated and database-backed routes on Vercel will fail. No data has been exported or transferred, and no Vercel project has been created or deployed by these changes.

## Hosting setup

1. Import this repository into a Vercel project using a Git repository accessible to your Vercel account.
2. Select Node.js 22.x and the repository root. The committed `vercel.json` specifies the install command, build command, and Build Output directory. Leave Vercel's system environment variables enabled: `VERCEL=1` selects the Vercel adapter.
3. Complete the database migration in an environment that supports moving storage away from Netlify before promoting the Vercel deployment to production. Transfer existing records, constraints, indexes, and migration history; changing the hosting adapter does not transfer data. Provision isolated preview storage separately from production.
4. Verify sign-in, signup and referral placement, account activation, password recovery, admin access, earnings calculations, and withdrawal requests against the migrated database. Verify direct navigation to member routes and missing routes as well as static assets.
5. After verification, connect the production domain to Vercel and update any shared referral and password-reset links. Users need to sign in again when changing domains because session cookies belong to the original domain.

The existing Netlify adapter remains available for the current site's deployment and local development until the database migration is complete. Applied database migration files remain unchanged.
