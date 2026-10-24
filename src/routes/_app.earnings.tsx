import { createFileRoute } from '@tanstack/react-router'
import { Coins, HandCoins, Sparkles } from 'lucide-react'

import { PageHeader, StatCard } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
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
import { getEarnings } from '@/server/member.functions'

export const Route = createFileRoute('/_app/earnings')({
  head: () => ({ meta: [{ title: 'Earnings · 1MERCADO' }] }),
  loader: () => getEarnings(),
  component: Earnings,
})

const typeLabel = {
  active: 'Active account',
  matching: 'Matching bonus',
  adjustment: 'Adjustment',
} as const

function Earnings() {
  const credits = Route.useLoaderData()
  const { wallet: s, plan } = useSession()
  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle={`${formatPeso(plan.perActiveAccount)} per active account plus a ${formatPeso(plan.matchingBonus)} matching bonus, up to ${formatPeso(plan.earningCap)}.`}
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total earned"
          value={formatPeso(s.earned)}
          icon={Coins}
          tone="brand"
        />
        <StatCard
          label="Active-account credits"
          value={formatPeso(s.cappedEarned)}
          hint={`of ${formatPeso(plan.earningCap)} cap`}
          icon={HandCoins}
        />
        <StatCard
          label="Matching bonuses"
          value={formatPeso(s.matchingEarned)}
          hint="Not counted toward the cap"
          icon={Sparkles}
          tone="gold"
        />
      </section>
      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="pr-5 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credits.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  No credits yet. They start arriving once your account is
                  active.
                </TableCell>
              </TableRow>
            ) : (
              credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-5 text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.type === 'matching'
                          ? 'warning'
                          : c.type === 'active'
                            ? 'success'
                            : 'secondary'
                      }
                    >
                      {typeLabel[c.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.description}</TableCell>
                  <TableCell
                    className={`pr-5 text-right font-semibold ${c.amount < 0 ? 'text-destructive' : 'text-primary'}`}
                  >
                    {c.amount < 0 ? '−' : '+'}
                    {formatPeso(Math.abs(c.amount))}
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
