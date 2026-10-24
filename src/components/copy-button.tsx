import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

/** Copies `text` and briefly shows a check mark. */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied!',
  toastMessage = 'Copied to clipboard',
  className,
  ...props
}: {
  text: string
  label?: string
  copiedLabel?: string
  toastMessage?: string
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function onClick() {
    if (await copyText(text)) {
      setCopied(true)
      toast.success(toastMessage)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy — press and hold the text to copy it')
    }
  }

  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(className)}
      aria-live="polite"
      {...props}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  )
}

/** Uses the phone's share sheet when there is one, otherwise copies the link. */
export function ShareButton({
  url,
  title,
  text,
  ...props
}: { url: string; title: string; text?: string } & Omit<
  ComponentProps<typeof Button>,
  'onClick' | 'children'
>) {
  async function onClick() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    if (await copyText(url)) toast.success('Referral link copied')
    else toast.error('Could not copy — press and hold the link to copy it')
  }
  return (
    <Button type="button" onClick={onClick} {...props}>
      <Share2 /> Share link
    </Button>
  )
}

/** The member's referral link. Tapping the field copies it automatically. */
export function ReferralLinkField({
  link,
  className,
}: {
  link: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function autoCopy(e: { currentTarget: HTMLInputElement }) {
    e.currentTarget.select()
    if (await copyText(link)) {
      setCopied(true)
      toast.success('Referral link copied')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor="referral-link" className="sr-only">
        Referral link
      </label>
      <input
        id="referral-link"
        readOnly
        value={link}
        onClick={autoCopy}
        onFocus={(e) => e.currentTarget.select()}
        title="Tap to copy"
        className="w-full cursor-copy truncate rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <CopyButton
        text={link}
        label="Copy link"
        copiedLabel="Link copied!"
        toastMessage="Referral link copied"
        variant={copied ? 'hero' : 'outline'}
        size="sm"
        className="w-full rounded-xl"
      />
    </div>
  )
}
