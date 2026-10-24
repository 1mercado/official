import { createFileRoute, useRouter } from '@tanstack/react-router'
import { KeyRound, Landmark, Loader2, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/app-shell'
import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/hooks/use-session'
import { formatDate } from '@/lib/plan'
import type { PayoutMethod } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import {
  changePassword,
  getProfile,
  savePayout,
  updateProfile,
} from '@/server/member.functions'

export const Route = createFileRoute('/_app/profile')({
  head: () => ({ meta: [{ title: 'Profile & Payouts · 1MERCADO' }] }),
  loader: () => getProfile(),
  component: ProfilePage,
})

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof KeyRound
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="surface-card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="font-display font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        className="rounded-xl bg-background/70"
        {...props}
      />
    </div>
  )
}

function useSubmit() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function run(
    task: () => Promise<unknown>,
    message: string,
    after?: () => void,
  ) {
    setBusy(true)
    try {
      await task()
      toast.success(message)
      after?.()
      await router.invalidate()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

function ProfileForm() {
  const { member } = useSession()
  const { busy, run } = useSubmit()
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    void run(
      () =>
        updateProfile({
          data: {
            fullName: String(d.get('fullName') ?? ''),
            mobile: String(d.get('mobile') ?? ''),
            city: String(d.get('city') ?? ''),
            email: String(d.get('email') ?? '').trim(),
          },
        }),
      'Profile saved',
    )
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field
        id="fullName"
        label="Full name"
        defaultValue={member.fullName}
        required
        autoComplete="name"
      />
      <Field
        id="mobile"
        label="Mobile (09…)"
        type="tel"
        defaultValue={member.mobile}
        required
        autoComplete="tel"
      />
      <Field
        id="email"
        label="Email"
        type="email"
        defaultValue={member.email ?? ''}
        autoComplete="email"
      />
      <Field id="city" label="City" defaultValue={member.city} required />
      <div className="sm:col-span-2">
        <Button type="submit" variant="hero" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save profile
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const { busy, run } = useSubmit()
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const d = new FormData(form)
    const next = String(d.get('next') ?? '')
    if (next.length < 6)
      return toast.error('New password needs at least 6 characters')
    if (next !== d.get('confirm'))
      return toast.error('The two new passwords do not match')
    void run(
      () =>
        changePassword({
          data: { current: String(d.get('current') ?? ''), next },
        }),
      'Password changed',
      () => form.reset(),
    )
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
      <Field
        id="current"
        label="Current password"
        type="password"
        required
        autoComplete="current-password"
      />
      <Field
        id="next"
        label="New password"
        type="password"
        required
        autoComplete="new-password"
      />
      <Field
        id="confirm"
        label="Repeat new password"
        type="password"
        required
        autoComplete="new-password"
      />
      <div className="sm:col-span-3">
        <Button type="submit" variant="hero" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Change password
        </Button>
      </div>
    </form>
  )
}

function PayoutForm() {
  const { payout } = Route.useLoaderData()
  const { busy, run } = useSubmit()
  const [method, setMethod] = useState<PayoutMethod>(payout?.method ?? 'GCash')
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    void run(
      () =>
        savePayout({
          data: {
            method,
            accountName: String(d.get('accountName') ?? ''),
            accountNumber: String(d.get('accountNumber') ?? ''),
            bankName:
              method === 'Bank' ? String(d.get('bankName') ?? '') : undefined,
          },
        }),
      'Payout account saved',
    )
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="method">Payout method</Label>
        <Select
          value={method}
          onValueChange={(v) => setMethod(v as PayoutMethod)}
        >
          <SelectTrigger
            id="method"
            className="w-full rounded-xl bg-background/70"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GCash">GCash</SelectItem>
            <SelectItem value="Maya">Maya</SelectItem>
            <SelectItem value="DigiCash">DigiCash</SelectItem>
            <SelectItem value="Bank">Bank transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {method === 'Bank' ? (
        <Field
          id="bankName"
          label="Bank name"
          defaultValue={payout?.bankName ?? ''}
          required
          placeholder="BDO, BPI, Landbank…"
        />
      ) : (
        <div className="hidden sm:block" />
      )}
      <Field
        id="accountName"
        label="Account name"
        defaultValue={payout?.accountName ?? ''}
        required
      />
      <Field
        id="accountNumber"
        label={method === 'Bank' ? 'Account number' : `${method} mobile number`}
        defaultValue={payout?.accountNumber ?? ''}
        required
        inputMode="numeric"
      />
      <div className="sm:col-span-2">
        <Button type="submit" variant="hero" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save payout account
        </Button>
      </div>
    </form>
  )
}

function ProfilePage() {
  const { member } = useSession()
  return (
    <>
      <PageHeader
        title="Profile & Payouts"
        subtitle="Keep your details and payout account up to date."
      />
      <div className="surface-card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-display text-lg font-bold">{member.fullName}</p>
          <p className="text-sm text-muted-foreground">
            @{member.username} · joined {formatDate(member.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={member.isActive ? 'success' : 'secondary'}>
            {member.isActive ? 'Active' : 'Not yet active'}
          </Badge>
          <Badge
            variant={member.entryStatus === 'confirmed' ? 'success' : 'warning'}
            className="capitalize"
          >
            Entry {member.entryStatus}
          </Badge>
          <span className="rounded-xl border border-border bg-background/60 px-3 py-1.5 font-mono text-sm">
            {member.memberCode}
          </span>
          <CopyButton
            text={member.memberCode}
            label="Copy code"
            toastMessage="Member code copied"
            variant="outline"
            size="sm"
          />
        </div>
      </div>
      <div className="grid gap-6">
        <Section
          icon={UserRound}
          title="Personal details"
          subtitle="Your username and member code can’t be changed."
        >
          <ProfileForm />
        </Section>
        <Section
          icon={Landmark}
          title="Payout account"
          subtitle="Where we send your approved withdrawals."
        >
          <PayoutForm />
        </Section>
        <Section
          icon={KeyRound}
          title="Password"
          subtitle="Use at least 6 characters."
        >
          <PasswordForm />
        </Section>
      </div>
    </>
  )
}
