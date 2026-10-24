import { createFileRoute } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/plan'
import { getNetwork } from '@/server/member.functions'

export const Route = createFileRoute('/_app/network')({
  head: () => ({ meta: [{ title: 'My Network · 1MERCADO' }] }),
  loader: () => getNetwork(),
  component: Network,
})

function Network() {
  const { rows: network, truncated } = Route.useLoaderData()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return network
    return network.filter((m) =>
      [m.fullName, m.username, m.memberCode, m.city].some((v) =>
        v.toLowerCase().includes(term),
      ),
    )
  }, [q, network])

  return (
    <>
      <PageHeader
        title="My Network"
        subtitle={`Everyone placed below you in your genealogy — ${network.length.toLocaleString('en-PH')}${truncated ? '+' : ''} accounts.`}
        actions={
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, code or city"
              aria-label="Search your network"
              className="w-64 rounded-xl bg-card/70 pl-9"
            />
          </div>
        }
      />
      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Member</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Directs</TableHead>
              <TableHead className="pr-5">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  {q
                    ? 'No members match your search.'
                    : 'No members yet — share your referral link.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-5">
                    <p className="font-medium">{m.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      @{m.username} · {m.memberCode}
                    </p>
                  </TableCell>
                  <TableCell>L{m.level}</TableCell>
                  <TableCell className="capitalize">{m.side ?? '—'}</TableCell>
                  <TableCell>{m.city}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        m.isActive
                          ? 'success'
                          : m.entryStatus === 'pending'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {m.isActive
                        ? 'Active'
                        : m.entryStatus === 'confirmed'
                          ? 'Paid'
                          : m.entryStatus === 'pending'
                            ? 'Pending entry'
                            : 'Unpaid'}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.directs}</TableCell>
                  <TableCell className="pr-5 text-muted-foreground">
                    {formatDate(m.joinedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
