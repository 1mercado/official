import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSession } from '@/hooks/use-session'
import { formatDate, formatPeso } from '@/lib/plan'
import { cn, errorMessage } from '@/lib/utils'
import { getWallet, requestWithdrawal } from '@/server/member.functions'

export const Route = createFileRoute('/_app/withdrawals')({
  head: () => ({ meta: [{ title: 'Wallet & Withdrawals · 1MERCADO' }] }),
  loader: () => getWallet(),
  component: Withdrawals,
})

const statusVariant = {
  pending: 'warning',
  approved: 'secondary',
  paid: 'success',
  rejected: 'destructive',
} as const

const presets = [100, 200, 500, 1000]

function Withdrawals() {
  const { wallet, plan } = useSession()
  const { payout, withdrawals: rows } = Route.useLoaderData()
  const router = useRouter()
  const [amount, setAmount] = useState<number>(
    Math.max(presets[0], plan.minWithdrawal),
  )
  const [busy, setBusy] = useState(false)
  const account = payout
    ? payout.method === 'Bank'
      ? `${payout.bankName ?? 'Bank'} · ${payout.accountNumber}`
      : `${payout.method} · ${payout.accountNumber}`
    : null

  async function request() {
    if (!payout)
      return toast.error('Add your payout account in Profile & Payouts first')
    if (!Number.isInteger(amount) || amount <= 0)
      return toast.error('Enter an amount in whole pesos')
    if (amount < plan.minWithdrawal)
      return toast.error(
        `Minimum withdrawal is ${formatPeso(plan.minWithdrawal)}`,
      )
    if (amount > wallet.balance)
      return toast.error('Amount is more than your available balance')
    if (amount > wallet.remainingToday)
      return toast.error('That exceeds today’s withdrawal limit')
    setBusy(true)
    try {
      const w = await requestWithdrawal({ data: { amount } })
      toast.success(
        `Withdrawal of ${formatPeso(w.amount)} requested · ${w.reference}`,
      )
      await router.invalidate()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Wallet & Withdrawals"
        subtitle={`Withdraw up to ${formatPeso(plan.dailyWithdrawalLimit)} a day — our team reviews and releases each request.`}
      />
      <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-primary-foreground shadow-soft">
          <div className="absolute -right-10 -bottom-10 size-40 rounded-full bg-white/15 blur-2xl" />
          <p className="text-sm text-primary-foreground/80">
            Available balance
          </p>
          <p className="mt-2 font-display text-4xl font-bold">
            {formatPeso(wallet.balance)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-primary-foreground/80">
            <p>
              Awaiting payout
              <span className="block text-sm font-semibold text-primary-foreground">
                {formatPeso(wallet.pendingOut)}
              </span>
            </p>
            <p>
              Paid out
              <span className="block text-sm font-semibold text-primary-foreground">
                {formatPeso(wallet.paidOut)}
              </span>
            </p>
          </div>
          <p className="mt-6 text-xs text-primary-foreground/80">
            Payout account
          </p>
          {payout ? (
            <>
              <p className="font-medium">{account}</p>
              <p className="text-xs text-primary-foreground/70">
                {payout.accountName}
              </p>
            </>
          ) : (
            <Button variant="gold" size="sm" className="mt-2" asChild>
              <Link to="/profile">Add payout account</Link>
            </Button>
          )}
        </div>
        <div className="surface-card p-6">
          <h2 className="font-display font-bold">Request a withdrawal</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets
              .filter((p) => p >= plan.minWithdrawal)
              .map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  aria-pressed={amount === p}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none',
                    amount === p
                      ? 'border-primary bg-secondary text-primary'
                      : 'border-border bg-background/60 hover:border-primary/50',
                  )}
                >
                  {formatPeso(p)}
                </button>
              ))}
            <button
              type="button"
              onClick={() =>
                setAmount(Math.min(wallet.balance, wallet.remainingToday))
              }
              className="rounded-xl border border-border bg-background/60 px-4 py-2 text-sm font-semibold transition hover:border-primary/50 motion-reduce:transition-none"
            >
              Max
            </button>
          </div>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void request()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="custom">Custom amount</Label>
              <Input
                id="custom"
                type="number"
                inputMode="numeric"
                min={plan.minWithdrawal}
                step={1}
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-40 rounded-xl"
              />
            </div>
            <Button type="submit" variant="hero" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Request {formatPeso(amount || 0)}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Minimum {formatPeso(plan.minWithdrawal)} ·{' '}
            {formatPeso(wallet.remainingToday)} left today. Funds go to the
            payout account saved in{' '}
            <Link
              to="/profile"
              className="font-medium text-primary hover:underline"
            >
              Profile &amp; Payouts
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="pr-5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No withdrawals yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-5 text-muted-foreground">
                    {formatDate(w.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {w.reference}
                  </TableCell>
                  <TableCell>{w.account}</TableCell>
                  <TableCell className="font-semibold">
                    {formatPeso(w.amount)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <Badge
                      variant={statusVariant[w.status]}
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
