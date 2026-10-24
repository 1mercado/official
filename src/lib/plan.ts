/** Launch defaults for the compensation plan. The live values live in the plan_settings table. */
export const defaultPlan = {
  entryPrice: 1998,
  requiredDirects: 2,
  perActiveAccount: 10,
  matchingBonus: 100,
  matchingLevels: 10,
  earningCap: 5000,
  dailyWithdrawalLimit: 50000,
  minWithdrawal: 100,
  paymentInstructions:
    'Send your entry to the official 1MERCADO GCash or bank account, then paste the reference number below.',
}

export type Plan = typeof defaultPlan

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export function formatPeso(value: number) {
  return peso.format(value)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** `origin` comes from the server (the request's own URL) so SSR and the browser render the same link. */
export function referralLink(code: string, origin: string) {
  return `${origin}/auth?mode=signup&ref=${encodeURIComponent(code)}`
}
