import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowUp, Home, Loader2, Network, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSession } from '@/hooks/use-session'
import { parseCodes } from '@/lib/codes'
import { formatPeso } from '@/lib/plan'
import { BULK_SIZES, bulkUsernames, type TreeNode } from '@/lib/types'
import { cn, errorMessage } from '@/lib/utils'
import { bulkEnroll, getTree, registerMember } from '@/server/member.functions'

export const Route = createFileRoute('/_app/genealogy')({
  validateSearch: z.object({
    root: z.coerce.number().int().positive().optional(),
  }),
  loaderDeps: ({ search }) => ({ root: search.root }),
  loader: ({ deps }) => getTree({ data: { rootId: deps.root } }),
  head: () => ({ meta: [{ title: 'Binary Genealogy · 1MERCADO' }] }),
  component: Genealogy,
})

type OpenSlot = { parent: TreeNode; side: 'left' | 'right' }

const memberFields = [
  ['full_name', 'Full name', 'text'],
  ['username', 'Username', 'text'],
  ['mobile', 'Mobile', 'tel'],
  ['city', 'City', 'text'],
  ['password', 'Password (min 6)', 'password'],
] as const

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
}

function NodeCard({ node, root }: { node: TreeNode; root?: boolean }) {
  return (
    <Link
      to="/genealogy"
      search={{ root: node.id }}
      title={`${node.fullName} — open this branch`}
      className={cn(
        'surface-card flex w-28 flex-col items-center gap-1 px-2 py-3 text-center transition-shadow hover:ring-2 hover:ring-primary/40 motion-reduce:transition-none sm:w-32',
        root && 'ring-2 ring-primary/50',
      )}
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full font-display text-sm font-bold',
          node.isActive
            ? 'bg-brand-gradient text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {initials(node.fullName)}
      </span>
      <span className="w-full truncate text-xs font-semibold">
        {node.username}
      </span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-medium',
          node.isActive
            ? 'bg-success/15 text-[oklch(0.4_0.1_155)]'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {node.isActive
          ? 'Active'
          : node.entryStatus === 'confirmed'
            ? 'Paid'
            : node.entryStatus === 'pending'
              ? 'Pending'
              : 'Unpaid'}
      </span>
    </Link>
  )
}

function Branch({
  node,
  depth,
  maxDepth,
  onOpen,
}: {
  node: TreeNode
  depth: number
  maxDepth: number
  onOpen: (slot: OpenSlot) => void
}) {
  const children: Array<['left' | 'right', TreeNode | undefined]> = [
    ['left', node.left],
    ['right', node.right],
  ]
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} root={depth === 0} />
      {depth < maxDepth ? (
        <>
          <div className="h-5 w-px bg-border" />
          <div className="relative flex gap-3 sm:gap-6">
            <div className="absolute top-0 right-1/4 left-1/4 h-px bg-border" />
            {children.map(([side, child]) => (
              <div key={side} className="flex flex-col items-center">
                <div className="h-5 w-px bg-border" />
                {child ? (
                  <Branch
                    node={child}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    onOpen={onOpen}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen({ parent: node, side })}
                    className="flex w-28 flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-primary/30 bg-card/40 px-2 py-4 text-xs font-medium text-primary transition hover:border-primary hover:bg-secondary sm:w-32"
                  >
                    <UserPlus className="size-5" />
                    Open position
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {side}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function MemberFields({ prefix }: { prefix: string }) {
  return memberFields.map(([id, label, type]) => (
    <div key={id} className="space-y-1.5">
      <Label htmlFor={`${prefix}-${id}`}>{label}</Label>
      <Input id={`${prefix}-${id}`} name={id} type={type} required />
    </div>
  ))
}

function CodeHelp() {
  return (
    <p className="text-xs text-muted-foreground">
      Activation codes are issued by the 1MERCADO admin and count as the paid
      entry — the account is confirmed and starts earning right away. Each code
      works once.
    </p>
  )
}

function ActivationCodeField() {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor="g-code">Activation code</Label>
      <Input
        id="g-code"
        name="activation_code"
        required
        maxLength={30}
        autoComplete="off"
        placeholder="1M-XXXX-XXXX"
        className="font-mono uppercase"
      />
      <CodeHelp />
    </div>
  )
}

function BulkCodesField({
  count,
  value,
  onChange,
}: {
  count: number
  value: string
  onChange: (v: string) => void
}) {
  const entered = parseCodes(value).length
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor="b-codes">
        Activation codes — one per account ({count.toLocaleString('en-PH')}{' '}
        needed)
      </Label>
      <Textarea
        id="b-codes"
        name="activation_codes"
        required
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'1M-XXXX-XXXX\n1M-XXXX-XXXX\n…'}
        className="font-mono text-xs uppercase"
        aria-describedby="b-codes-count"
      />
      <p
        id="b-codes-count"
        className={cn(
          'text-xs font-medium',
          entered === count ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {entered.toLocaleString('en-PH')} of {count.toLocaleString('en-PH')}{' '}
        codes entered. Paste one per line, or separate them with commas.
      </p>
      <CodeHelp />
    </div>
  )
}

function profileFrom(data: FormData) {
  return {
    fullName: String(data.get('full_name') ?? ''),
    mobile: String(data.get('mobile') ?? ''),
    city: String(data.get('city') ?? ''),
    password: String(data.get('password') ?? ''),
  }
}

function Genealogy() {
  const tree = Route.useLoaderData()
  const { plan } = useSession()
  const router = useRouter()
  const [slot, setSlot] = useState<OpenSlot | null>(null)
  const [bulkSize, setBulkSize] = useState(String(BULK_SIZES[0]))
  const [bulkBase, setBulkBase] = useState('')
  const [bulkCodes, setBulkCodes] = useState('')
  const [busy, setBusy] = useState(false)

  const count = Number(bulkSize)
  const levels = Math.log2(count + 1)
  const preview = bulkUsernames(
    bulkBase.trim().toLowerCase() || 'username',
    count,
  )

  function close() {
    if (busy) return
    setSlot(null)
    setBulkBase('')
    setBulkCodes('')
  }

  async function submit(task: () => Promise<string>) {
    setBusy(true)
    try {
      const message = await task()
      toast.success(message)
      setSlot(null)
      setBulkBase('')
      setBulkCodes('')
      await router.invalidate()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!slot) return
    const data = new FormData(e.currentTarget)
    const profile = profileFrom(data)
    if (profile.password.length < 6)
      return toast.error('Password needs at least 6 characters')
    const activationCode = String(data.get('activation_code') ?? '').trim()
    if (!activationCode) return toast.error('Enter the activation code')
    void submit(async () => {
      const res = await registerMember({
        data: {
          ...profile,
          activationCode,
          username: String(data.get('username') ?? ''),
          parentId: slot.parent.id,
          side: slot.side,
        },
      })
      return `${res.username} (${res.memberCode}) placed under ${slot.parent.username} and activated with their code. They can sign in right away.`
    })
  }

  function onBulkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!slot) return
    const data = new FormData(e.currentTarget)
    const profile = profileFrom(data)
    const base = String(data.get('username') ?? '').trim()
    if (!/^[a-z0-9_]{3,16}$/i.test(base))
      return toast.error('Base username: 3–16 letters, numbers, or underscores')
    if (profile.password.length < 6)
      return toast.error('Password needs at least 6 characters')
    const activationCodes = parseCodes(bulkCodes)
    if (activationCodes.length !== count)
      return toast.error(
        `Enter exactly ${count.toLocaleString('en-PH')} activation codes — one per account`,
      )
    void submit(async () => {
      const res = await bulkEnroll({
        data: {
          ...profile,
          activationCodes,
          baseUsername: base,
          count,
          parentId: slot.parent.id,
          side: slot.side,
        },
      })
      return `Enrolled ${res.count.toLocaleString('en-PH')} accounts (${levels} levels) under ${slot.parent.username}, ${slot.side} side.`
    })
  }

  return (
    <>
      <PageHeader
        title="Binary Genealogy"
        subtitle="Your first two referrals become your left and right branches. Tap an open position to register someone there with an activation code, or enroll a whole block of accounts at once (one code per account). Tap any member to open their branch."
        actions={
          tree.isMe ? null : (
            <>
              {tree.parentId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl bg-card/70"
                  asChild
                >
                  <Link to="/genealogy" search={{ root: tree.parentId }}>
                    <ArrowUp /> Up one level
                  </Link>
                </Button>
              ) : null}
              <Button variant="hero" size="sm" asChild>
                <Link to="/genealogy" search={{}}>
                  <Home /> Back to me
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="surface-card p-4 text-center">
          <p className="text-xs text-muted-foreground">Left branch</p>
          <p className="font-display text-xl font-bold">
            {tree.leftCount.toLocaleString('en-PH')}
          </p>
        </div>
        <div className="surface-card p-4 text-center">
          <p className="text-xs text-muted-foreground">Right branch</p>
          <p className="font-display text-xl font-bold">
            {tree.rightCount.toLocaleString('en-PH')}
          </p>
        </div>
      </div>
      <div className="surface-card overflow-x-auto p-6">
        <div className="mx-auto w-max py-2">
          <Branch
            node={tree.root}
            depth={0}
            maxDepth={tree.depth}
            onOpen={setSlot}
          />
        </div>
      </div>

      <Dialog open={!!slot} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Register a new member</DialogTitle>
            <DialogDescription>
              {slot
                ? `Placing on the ${slot.side} of ${slot.parent.username}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="single">
            <TabsList className="w-full">
              <TabsTrigger value="single">
                <UserPlus /> Single account
              </TabsTrigger>
              <TabsTrigger value="bulk">
                <Network /> Bulk enroll
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <form
                onSubmit={onSubmit}
                className="grid gap-3 pt-2 sm:grid-cols-2"
              >
                <MemberFields prefix="g" />
                <ActivationCodeField />
                <Button
                  type="submit"
                  variant="hero"
                  className="sm:col-span-2"
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Create and place member
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="bulk">
              <form
                onSubmit={onBulkSubmit}
                className="grid gap-3 pt-2 sm:grid-cols-2"
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="b-count">Number of accounts</Label>
                  <Select value={bulkSize} onValueChange={setBulkSize}>
                    <SelectTrigger id="b-count" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BULK_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n.toLocaleString('en-PH')} accounts ·{' '}
                          {Math.log2(n + 1)} levels
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {memberFields.map(([id, label, type]) => (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={`b-${id}`}>
                      {id === 'username' ? 'Base username' : label}
                    </Label>
                    <Input
                      id={`b-${id}`}
                      name={id}
                      type={type}
                      required
                      {...(id === 'username'
                        ? {
                            value: bulkBase,
                            onChange: (e) => setBulkBase(e.target.value),
                          }
                        : {})}
                    />
                  </div>
                ))}
                <div className="rounded-xl bg-secondary/60 p-3 text-xs sm:col-span-2">
                  <p className="font-semibold text-foreground">
                    Fills a complete {levels}-level binary tree from this
                    position
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Usernames: {preview.slice(0, 3).join(', ')}
                    {count > 3 ? ` … ${preview[count - 1]}` : ''}. All accounts
                    share the same profile and password. Entry value:{' '}
                    <span className="font-semibold text-foreground">
                      {formatPeso(count * plan.entryPrice)}
                    </span>{' '}
                    ({count.toLocaleString('en-PH')} activation codes)
                  </p>
                </div>
                <BulkCodesField
                  count={count}
                  value={bulkCodes}
                  onChange={setBulkCodes}
                />
                <Button
                  type="submit"
                  variant="hero"
                  className="sm:col-span-2"
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy
                    ? 'Enrolling…'
                    : `Enroll ${count.toLocaleString('en-PH')} accounts`}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
