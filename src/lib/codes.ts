/** Activation codes look like 1M-ABCD-2345. Input is forgiving about case, spaces and dashes. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeCode(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('1M') && raw.length === 10 ? raw.slice(2) : raw
  return body.length === 8
    ? `1M-${body.slice(0, 4)}-${body.slice(4)}`
    : input.trim().toUpperCase()
}

/** Splits pasted text (one per line, or separated by commas/spaces) into normalised codes. */
export function parseCodes(text: string) {
  return text
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map(normalizeCode)
}

export const CODE_RE = /^1M-[A-Z0-9]{4}-[A-Z0-9]{4}$/
