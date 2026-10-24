import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { planSettings } from '../../db/schema.js'
import { defaultPlan, type Plan } from '@/lib/plan'

type Executor = Pick<typeof db, 'select'>

/** Reads the single plan_settings row, falling back to the launch defaults before an admin saves one. */
export async function loadPlan(executor: Executor = db): Promise<Plan> {
  const [row] = await executor
    .select()
    .from(planSettings)
    .where(eq(planSettings.id, 1))
    .limit(1)
  if (!row) return defaultPlan
  return {
    entryPrice: row.entryPrice,
    requiredDirects: row.requiredDirects,
    perActiveAccount: row.perActiveAccount,
    matchingBonus: row.matchingBonus,
    matchingLevels: row.matchingLevels,
    earningCap: row.earningCap,
    dailyWithdrawalLimit: row.dailyWithdrawalLimit,
    minWithdrawal: row.minWithdrawal,
    paymentInstructions: row.paymentInstructions,
  }
}
