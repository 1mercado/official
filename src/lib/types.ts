/** Shapes the server functions return to the screens. Dates are ISO strings. */
export type EntryStatus = 'unpaid' | 'pending' | 'confirmed' | 'rejected'
export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected'
export type CreditType = 'active' | 'matching' | 'adjustment'
export type PayoutMethod = 'GCash' | 'Maya' | 'DigiCash' | 'Bank'

export type Member = {
  id: number
  memberCode: string
  username: string
  fullName: string
  email: string | null
  mobile: string
  city: string
  entryStatus: EntryStatus
  entryReference: string | null
  isActive: boolean
  isAdmin: boolean
  createdAt: string
}

export type PayoutAccount = {
  method: PayoutMethod
  accountName: string
  accountNumber: string
  bankName: string | null
}

export type Credit = {
  id: number
  createdAt: string
  type: CreditType
  description: string
  amount: number
}

export type Withdrawal = {
  id: number
  createdAt: string
  reference: string
  account: string
  amount: number
  status: WithdrawalStatus
  note: string | null
}

export type NetworkMember = {
  id: number
  fullName: string
  username: string
  memberCode: string
  level: number
  side: 'left' | 'right' | null
  city: string
  isActive: boolean
  entryStatus: EntryStatus
  directs: number
  joinedAt: string
}

export type TreeNode = {
  id: number
  username: string
  fullName: string
  isActive: boolean
  entryStatus: EntryStatus
  left?: TreeNode
  right?: TreeNode
}

/** Bulk sizes fill a complete binary tree: 2^levels − 1 accounts (2 to 10 levels deep). */
export const BULK_SIZES = Array.from({ length: 9 }, (_, i) => 2 ** (i + 2) - 1)

export function bulkUsernames(base: string, count: number) {
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? base : `${base}${i + 1}`,
  )
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/
export const MOBILE_RE = /^(09|\+639)\d{9}$/
