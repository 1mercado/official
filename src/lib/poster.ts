import QRCode from 'qrcode'

import { formatPeso, type Plan } from '@/lib/plan'

export type PosterFormat = 'square' | 'vertical'

export const POSTER_SIZES: Record<
  PosterFormat,
  { width: number; height: number; label: string }
> = {
  square: {
    width: 1080,
    height: 1080,
    label: 'Square · 1080 × 1080 (Facebook / Instagram feed)',
  },
  vertical: {
    width: 1080,
    height: 1920,
    label: 'Vertical · 1080 × 1920 (Stories / Reels / TikTok)',
  },
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draws a branded recruitment poster with the member's QR code and referral code. Returns a PNG data URL. */
export async function renderPoster(
  format: PosterFormat,
  opts: { link: string; code: string; name: string; plan: Plan },
) {
  const { width: W, height: H } = POSTER_SIZES[format]
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await document.fonts?.ready

  // Backdrop: deep green with soft green and gold glows.
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0f5c43')
  bg.addColorStop(1, '#0a2e22')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  for (const [x, y, r, color] of [
    [W * 0.15, H * 0.1, W * 0.6, 'rgba(46, 204, 133, 0.45)'],
    [W * 0.95, H * 0.75, W * 0.7, 'rgba(255, 199, 64, 0.35)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  const pad = 80
  const tall = format === 'vertical'
  let y = tall ? 150 : 60

  const logo = await loadImage('/logo.png')
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, pad, y - 8, 112, 112, 24)
  ctx.fill()
  ctx.drawImage(logo, pad + 6, y - 2, 100, 100)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 52px Sora, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('1MERCADO', pad + 120, y + 36)
  ctx.font = '500 26px Manrope, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('Shopping', pad + 122, y + 78)

  y += tall ? 220 : 130
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffd76a'
  ctx.font = '700 26px Manrope, sans-serif'
  ctx.fillText('ALL IN ONE SUPERMARKET FOR THE MASSES', pad, y)
  y += tall ? 110 : 80
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${tall ? 96 : 68}px Sora, sans-serif`
  for (const line of ['Shop, refer,', 'and earn every day']) {
    ctx.fillText(line, pad, y)
    y += tall ? 110 : 80
  }

  const { plan } = opts
  const facts = [
    [formatPeso(plan.entryPrice), 'one-time entry'],
    [String(plan.requiredDirects), 'direct referrals to activate'],
    [formatPeso(plan.perActiveAccount), 'per active account'],
    [formatPeso(plan.dailyWithdrawalLimit), 'daily withdrawals'],
  ]
  y += tall ? 40 : 0
  const cols = 2
  const gap = tall ? 24 : 20
  const cardW = (W - pad * 2 - gap) / cols
  const cardH = tall ? 170 : 110
  facts.forEach(([big, small], i) => {
    const cx = pad + (i % cols) * (cardW + gap)
    const cy = y + Math.floor(i / cols) * (cardH + gap)
    roundRect(ctx, cx, cy, cardW, cardH, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.fillStyle = '#ffd76a'
    ctx.font = `800 ${tall ? 58 : 42}px Sora, sans-serif`
    ctx.fillText(big, cx + 32, cy + (tall ? 85 : 56))
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `600 ${tall ? 28 : 22}px Manrope, sans-serif`
    ctx.fillText(small, cx + 32, cy + (tall ? 130 : 90))
  })
  y += (cardH + gap) * 2 + (tall ? 80 : 20)

  // Referral block: QR code + code + call to action.
  const qrSize = tall ? 360 : 200
  const blockH = qrSize + 60
  const blockY = tall ? Math.max(y, H - blockH - 160) : H - blockH - 60
  roundRect(ctx, pad, blockY, W - pad * 2, blockH, 36)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  const qr = await loadImage(
    await QRCode.toDataURL(opts.link, {
      margin: 1,
      width: qrSize,
      color: { dark: '#0a2e22', light: '#ffffff' },
    }),
  )
  ctx.drawImage(qr, pad + 30, blockY + 30, qrSize, qrSize)
  const tx = pad + qrSize + 70
  ctx.fillStyle = '#0f5c43'
  ctx.font = `800 ${tall ? 48 : 38}px Sora, sans-serif`
  ctx.fillText('Join my team!', tx, blockY + (tall ? 110 : 75))
  ctx.fillStyle = '#334'
  ctx.font = `600 ${tall ? 30 : 24}px Manrope, sans-serif`
  ctx.fillText(
    'Scan the code or use referrer code',
    tx,
    blockY + (tall ? 170 : 120),
  )
  ctx.fillStyle = '#e8a317'
  ctx.font = `800 ${tall ? 56 : 44}px Sora, sans-serif`
  ctx.fillText(opts.code, tx, blockY + (tall ? 250 : 180))
  ctx.fillStyle = '#556'
  ctx.font = `500 ${tall ? 28 : 22}px Manrope, sans-serif`
  ctx.fillText(
    `Invited by ${opts.name}`.slice(0, 40),
    tx,
    blockY + (tall ? 310 : 222),
  )

  if (tall) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '500 26px Manrope, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(new URL(opts.link).host, W / 2, H - 80)
    ctx.textAlign = 'left'
  }

  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
