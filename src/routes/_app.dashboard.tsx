import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Coins,
  Loader2,
  Ticket,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { PageHeader, StatCard } from '@/components/app-shell'
import { ReferralLinkField, ShareButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useSession } from '@/hooks/use-session'
import { formatDate, formatPeso, referralLink } from '@/lib/plan'
import { errorMessage } from '@/lib/utils'
import {
  getDashboard,
  redeemActivationCode,
  submitEntryReference,
} from '@/server/member.functions'

export const Route = createFileRoute('/_app/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard · 1MERCADO' }] }),
  loader: () => getDashboard(),
  component: Dashboard,
})

/** Entry payment card — shown until an admin confirms the member's entry. */
function EntryPaymentCard() {
  const { member, plan } = useSession()
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'code' | 'ref' | null>(null)
  const status = member.entryStatus
  if (status === 'confirmed') return null

  async function redeem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy('code')
    try {
      const res = await redeemActivationCode({ data: { code } })
      toast.success(
        `Code accepted — your entry is confirmed${res.credited ? ` and ${res.credited} credits were posted in your line` : ''}!`,
      )
      setCode('')
      await router.invalidate()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="surface-card mb-6 border-warning/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold">
            Complete your {formatPeso(plan.entryPrice)} entry
          </h2>
          <p className="mt-1 max-w-xl text-sm whitespace-pre-line text-muted-foreground">
            {plan.paymentInstructions}
          </p>
        </div>
        <Badge
          variant={
            status === 'rejected'
              ? 'destructive'
              : status === 'pending'
                ? 'warning'
                : 'secondary'
          }
        >
          {status === 'pending'
            ? 'Awaiting confirmation'
            : status === 'rejected'
              ? 'Rejected — resubmit'
              : 'Unpaid'}
        </Badge>
      </div>
      <form className="mt-4 space-y-2" onSubmit={redeem}>
        <Label htmlFor="entry-code" className="text-sm font-semibold">
          Have an activation code?
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="entry-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="1M-XXXX-XXXX"
            autoComplete="off"
            maxLength={30}
            required
            className="max-w-xs rounded-xl font-mono uppercase"
          />
          <Button type="submit" variant="gold" disabled={busy !== null}>
            {busy === 'code' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Ticket />
            )}
            Activate with code
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A code pays your entry instantly — no waiting for review.
        </p>
      </form>
      {status === 'pending' ? (
        <p className="mt-4 text-sm">
          Reference submitted:{' '}
          <span className="font-mono font-semibold">
            {member.entryReference}
          </span>
          . Our team confirms payments within the day.
        </p>
      ) : (
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy('ref')
            try {
              await submitEntryReference({ data: { reference } })
              toast.success('Reference sent — we will confirm it shortly')
              await router.invalidate()
            } catch (err) {
              toast.error(errorMessage(err))
            } finally {
              setBusy(null)
            }
          }}
        >
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Or paste your GCash / Maya / bank reference no."
            aria-label="Payment reference number"
            maxLength={60}
            required
            className="max-w-xs rounded-xl"
          />
          <Button type="submit" variant="hero" disabled={busy !== null}>
            {busy === 'ref' ? <Loader2 className="animate-spin" /> : null}
            Submit reference
          </Button>
        </form>
      )}
    </div>
  )
}

function Dashboard() {
  const { member, plan, wallet, origin } = useSession()
  const { stats, credits } = Route.useLoaderData()
  const link = referralLink(member.memberCode, origin)
  const firstName = member.fullName.split(' ')[0]
  return (
    <>
      <PageHeader
        title={`Kumusta, ${firstName}!`}
        subtitle={`You earn ${formatPeso(plan.perActiveAccount)} for each active account in your Shopping line.`}
        actions={
          <>
            <ShareButton
              url={link}
              title="Join me on 1MERCADO Shopping"
              variant="outline"
              size="sm"
              className="rounded-xl bg-card/70"
            />
            <Button variant="hero" size="sm" asChild>
              <Link to="/withdrawals">
                <Wallet /> Withdraw
              </Link>
            </Button>
          </>
        }
      />

      <EntryPaymentCard />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total earned"
          value={formatPeso(wallet.earned)}
          hint={`Cap ${formatPeso(plan.earningCap)}`}
          icon={Coins}
          tone="brand"
          footer={
            <Progress value={wallet.capProgress * 100} className="mt-3 h-1.5" />
          }
        />
        <StatCard
          label="Available balance"
          value={formatPeso(wallet.balance)}
          hint={`${formatPeso(wallet.remainingToday)} left to withdraw today`}
          icon={Wallet}
          tone="gold"
        />
        <StatCard
          label="Active accounts below"
          value={stats.active.toLocaleString('en-PH')}
          hint={`${stats.total.toLocaleString('en-PH')} accounts in your line`}
          icon={Users}
        />
        <StatCard
          label="Paid direct referrals"
          value={`${Math.min(stats.directs, plan.requiredDirects)} / ${plan.requiredDirects}`}
          hint={
            member.isActive
              ? 'Your account is active'
              : `${plan.requiredDirects} paid directs activate you`
          }
          icon={UserCheck}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold">Latest credits</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/earnings">
                View all <ArrowUpRight />
              </Link>
            </Button>
          </div>
          {credits.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No credits yet. They start arriving once your account is active.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/70">
              {credits.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{c.description}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </span>
                  </span>
                  <span
                    className={
                      c.amount < 0
                        ? 'font-semibold text-destructive'
                        : 'font-semibold text-primary'
                    }
                  >
                    {c.amount < 0 ? '−' : '+'}
                    {formatPeso(Math.abs(c.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card space-y-6 p-5">
          <div>
            <h2 className="font-display font-bold">Income cap progress</h2>
            <p className="text-xs text-muted-foreground">
              Active-account credits count toward the{' '}
              {formatPeso(plan.earningCap)} cap.
            </p>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">
                {Math.round(wallet.capProgress * 100)}%
              </span>
              <span className="text-sm text-muted-foreground">
                {formatPeso(Math.max(plan.earningCap - wallet.cappedEarned, 0))}{' '}
                to go
              </span>
            </div>
            <Progress value={wallet.capProgress * 100} className="mt-2 h-2" />
          </div>
          <div>
            <h2 className="font-display font-bold">Your referral link</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Tap the link to copy it.
            </p>
            <ReferralLinkField link={link} />
            <p className="mt-2 text-xs text-muted-foreground">
              Member code:{' '}
              <span className="font-mono font-semibold">
                {member.memberCode}
              </span>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
