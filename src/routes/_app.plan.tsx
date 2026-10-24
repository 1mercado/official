import { createFileRoute } from '@tanstack/react-router'

import { PageHeader } from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { formatPeso, type Plan } from '@/lib/plan'

export const Route = createFileRoute('/_app/plan')({
  head: () => ({ meta: [{ title: 'Compensation Plan · 1MERCADO' }] }),
  component: PlanPage,
})

const rules = (plan: Plan) => [
  {
    title: 'Pay your entry',
    text: `Pay ${formatPeso(plan.entryPrice)} once and submit the payment reference. An admin confirms it.`,
  },
  {
    title: 'Activate your account',
    text: `You become active as soon as ${plan.requiredDirects} of your direct referrals have paid their entry.`,
  },
  {
    title: 'Earn per active account',
    text: `Receive ${formatPeso(plan.perActiveAccount)} for each active account in your line — members who joined after you and those placed before you.`,
  },
  {
    title: 'Matching bonus',
    text: `Get ${formatPeso(plan.matchingBonus)} for every left-and-right pair of active members in your genealogy, counted up to ${plan.matchingLevels} levels deep.`,
  },
  {
    title: 'Income cap',
    text: `Active-account credits stop at ${formatPeso(plan.earningCap)} per account. Matching bonuses have no limit and don't count toward the cap.`,
  },
  {
    title: 'Daily withdrawals',
    text: `Cash out up to ${formatPeso(plan.dailyWithdrawalLimit)} a day to GCash, Maya, or your bank. Every payout is reviewed and released by hand.`,
  },
]

function PlanPage() {
  const { plan } = useSession()
  return (
    <>
      <PageHeader
        title="Compensation Plan"
        subtitle="Clear rules, applied the same way to every active member."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {rules(plan).map((r, i) => (
          <div key={r.title} className="surface-card flex gap-4 p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold-gradient font-bold text-gold-foreground">
              {i + 1}
            </span>
            <div>
              <h2 className="font-display font-bold">{r.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
