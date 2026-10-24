import { randomInt } from 'node:crypto'

import { inArray, sql, type SQL } from 'drizzle-orm'

import { activationCodes } from '../../db/schema.js'
import { CODE_ALPHABET, CODE_RE, normalizeCode } from '@/lib/codes'
import type { Tx } from './members.server'

export function newActivationCode() {
  let body = ''
  for (let i = 0; i < 8; i++)
    body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `1M-${body.slice(0, 4)}-${body.slice(4)}`
}

/**
 * Locks the given codes for this transaction and checks every one is real and unused, so two
 * sign-ups can never redeem the same code. Returns the normalised codes in input order.
 */
export async function claimCodes(tx: Tx, input: string[]) {
  const codes = input.map(normalizeCode)
  if (codes.length === 0) throw new Error('Enter an activation code')
  const dupe = codes.find((c, i) => codes.indexOf(c) !== i)
  if (dupe) throw new Error(`Activation code ${dupe} is listed more than once`)
  const bad = codes.find((c) => !CODE_RE.test(c))
  if (bad) throw new Error(`"${bad}" is not a valid activation code`)
  const rows = await tx
    .select({ code: activationCodes.code, status: activationCodes.status })
    .from(activationCodes)
    .where(inArray(activationCodes.code, codes))
    .for('update')
  const found = new Map(rows.map((r) => [r.code, r.status]))
  for (const c of codes) {
    const status = found.get(c)
    if (!status) throw new Error(`Activation code ${c} was not found`)
    if (status === 'used')
      throw new Error(`Activation code ${c} has already been used`)
    if (status === 'void')
      throw new Error(`Activation code ${c} has been cancelled`)
  }
  return codes
}

/** Ties claimed codes to the accounts that redeemed them (matched on the stored entry reference). */
export async function markCodesUsed(tx: Tx, codes: string[], owners: SQL) {
  await tx.execute(sql`
    update activation_codes c
    set status = 'used', used_by = m.id, used_at = now(), updated_at = now()
    from members m
    where m.entry_reference = c.code and c.status = 'unused'
      and c.code in (${sql.join(
        codes.map((x) => sql`${x}`),
        sql`, `,
      )})
      and ${owners}
  `)
}

/** Member fields that make a redeemed code count as a confirmed entry payment. */
export function redeemedEntry(code: string) {
  return {
    entryReference: code,
    entryStatus: 'confirmed' as const,
    entrySubmittedAt: new Date(),
    entryConfirmedAt: new Date(),
  }
}
