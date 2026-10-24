import { createFileRoute } from '@tanstack/react-router'
import { Download, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/app-shell'
import { CopyButton, ReferralLinkField } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSession } from '@/hooks/use-session'
import { formatPeso, referralLink, type Plan } from '@/lib/plan'
import {
  downloadDataUrl,
  POSTER_SIZES,
  renderPoster,
  type PosterFormat,
} from '@/lib/poster'

export const Route = createFileRoute('/_app/marketing')({
  head: () => ({ meta: [{ title: 'Marketing Materials · 1MERCADO' }] }),
  component: Marketing,
})

type Script = { id: string; title: string; channel: string; text: string }

function scripts(
  plan: Plan,
  link: string,
  code: string,
  name: string,
): Script[] {
  const entry = formatPeso(plan.entryPrice)
  const per = formatPeso(plan.perActiveAccount)
  const cap = formatPeso(plan.earningCap)
  const daily = formatPeso(plan.dailyWithdrawalLimit)
  const directs = plan.requiredDirects
  return [
    {
      id: 'post',
      title: 'Facebook / Instagram post',
      channel: 'Feed post',
      text: `🛒 Mamili, mag-refer, at kumita araw-araw with 1MERCADO Shopping!

✅ ${entry} one-time entry — walang monthly fees
✅ Invite ${directs} members to activate your account
✅ Earn ${per} for every active account in your line, up to ${cap}
✅ ${formatPeso(plan.matchingBonus)} matching bonus for every left + right pair
✅ Withdraw up to ${daily} a day via GCash, Maya or bank

Sign up here 👉 ${link}
Referrer code: ${code}

#1MERCADO #1MERCADOShopping #EarnWhileYouShop`,
    },
    {
      id: 'message',
      title: 'Messenger / Viber / SMS message',
      channel: 'Direct message',
      text: `Hi! 👋 Si ${name} ito. May sinalihan akong rewards plan — 1MERCADO Shopping. One-time ${entry} lang, then you earn ${per} for every active account in your line (up to ${cap}). Pwede mag-withdraw sa GCash/Maya/bank.

Gusto mo bang malaman pa? Sign up here: ${link}
(Referrer code: ${code})`,
    },
    {
      id: 'caption',
      title: 'TikTok / Reels caption',
      channel: 'Short video',
      text: `POV: your grocery habit starts paying you back 🛒💸 ${per} per active account, ${daily} daily withdrawals. Link in bio or use code ${code} 👉 ${link} #1MERCADO #SideHustlePH #EarnWhileYouShop`,
    },
    {
      id: 'live',
      title: 'Live-selling script',
      channel: 'Facebook / TikTok Live',
      text: `Magandang gabi, mga ka-1MERCADO! 🙌

1️⃣ Ano ang 1MERCADO Shopping? All-in-one supermarket rewards plan for the masses.
2️⃣ Paano sumali? One-time entry na ${entry}. Wala nang monthly.
3️⃣ Paano kumita? Kapag naka-${directs} paid direct referrals ka na, active ka na — ${per} for every active account sa line mo, up to ${cap}, plus ${formatPeso(plan.matchingBonus)} matching bonus per pair.
4️⃣ Paano mag-cash out? Up to ${daily} a day, diretso sa GCash, Maya o bank mo.

I-comment ang "JOIN" at ise-send ko ang link! O diretso na dito: ${link} — referrer code ${code}.`,
    },
    {
      id: 'follow1',
      title: 'Follow-up · day 1',
      channel: 'Direct message',
      text: `Hi! Follow up lang po sa 1MERCADO Shopping na na-share ko kahapon 😊 May tanong ka ba? Ito ulit ang link mo: ${link}`,
    },
    {
      id: 'follow2',
      title: 'Follow-up · day 3',
      channel: 'Direct message',
      text: `Kumusta! Marami na ang nag-join sa team natin this week 🎉 Sayang kung hindi ka makakasama sa early part ng line. One-time ${entry} lang. Sign up: ${link} (code ${code})`,
    },
    {
      id: 'qa',
      title: 'Q&A replies',
      channel: 'Comments / chats',
      text: `Q: Magkano ang entry?
A: One-time ${entry} lang, walang monthly fees.

Q: Paano ako magiging active?
A: Kapag ${directs} sa direct referrals mo ang nakapag-bayad na ng entry.

Q: Magkano ang kikitain ko?
A: ${per} per active account sa line mo, up to ${cap}, plus ${formatPeso(plan.matchingBonus)} matching bonus for every left and right pair.

Q: Paano mag-withdraw?
A: Request sa app — up to ${daily} a day via GCash, Maya o bank. Every payout is checked and released by the 1MERCADO team.

Sign up: ${link}`,
    },
    {
      id: 'invite',
      title: 'Presentation invite',
      channel: 'Group chat',
      text: `📣 You're invited to a 1MERCADO Shopping online presentation!

Alamin kung paano kumita ng ${per} per active account at mag-withdraw ng up to ${daily} a day.

🗓️ Date: ____
⏰ Time: ____
📍 Link: ____

Gusto mo nang mag-sign up agad? ${link} (code ${code})`,
    },
    {
      id: 'welcome',
      title: 'Welcome message for new members',
      channel: 'Direct message',
      text: `Welcome to the team! 🎉 Salamat sa pag-join sa 1MERCADO Shopping.

Next steps:
1. Pay your ${entry} entry and submit the reference in your dashboard.
2. Add your GCash/Maya/bank in Profile & Payouts.
3. Share your own referral link from the dashboard — ${directs} paid directs activate your account.

Andito lang ako kung may tanong ka! — ${name}`,
    },
  ]
}

function PosterCard({
  format,
  link,
  code,
  name,
  plan,
}: {
  format: PosterFormat
  link: string
  code: string
  name: string
  plan: Plan
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    renderPoster(format, { link, code, name, plan })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [format, link, code, name, plan])

  const size = POSTER_SIZES[format]
  return (
    <div className="surface-card flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display font-bold capitalize">{format} poster</h3>
        <p className="text-xs text-muted-foreground">{size.label}</p>
      </div>
      <div
        className="grid place-items-center overflow-hidden rounded-xl bg-secondary/50"
        style={{
          aspectRatio: `${size.width} / ${size.height}`,
          maxHeight: 520,
        }}
      >
        {url ? (
          <img
            src={url}
            alt={`${format} 1MERCADO poster with your QR code`}
            className="h-full w-full object-contain"
          />
        ) : failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Could not draw the poster in this browser.
          </p>
        ) : (
          <Loader2
            className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-label="Drawing poster"
          />
        )}
      </div>
      <Button
        variant="hero"
        disabled={!url}
        onClick={() => {
          if (!url) return
          downloadDataUrl(url, `1mercado-${format}-${code}.png`)
          toast.success('Poster downloaded')
        }}
      >
        <Download /> Download PNG
      </Button>
    </div>
  )
}

function Marketing() {
  const { member, plan, origin } = useSession()
  const link = referralLink(member.memberCode, origin)
  const list = scripts(
    plan,
    link,
    member.memberCode,
    member.fullName.split(' ')[0],
  )

  return (
    <>
      <PageHeader
        title="Marketing Materials"
        subtitle="Posters and ready-to-send scripts — every one already carries your referral link."
      />
      <section className="surface-card mb-6 grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <h2 className="font-display font-bold">Your referral link</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Tap the link to copy it.
          </p>
          <ReferralLinkField link={link} />
        </div>
        <Button variant="outline" className="rounded-xl bg-card/70" asChild>
          <a href="/logo.png" download="1mercado-logo.png">
            <ImageIcon /> Download logo
          </a>
        </Button>
      </section>

      <Tabs defaultValue="posters">
        <TabsList>
          <TabsTrigger value="posters">Posters</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="posters" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PosterCard
              format="square"
              link={link}
              code={member.memberCode}
              name={member.fullName}
              plan={plan}
            />
            <PosterCard
              format="vertical"
              link={link}
              code={member.memberCode}
              name={member.fullName}
              plan={plan}
            />
          </div>
        </TabsContent>
        <TabsContent value="scripts" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((s) => (
              <article
                key={s.id}
                className="surface-card flex flex-col gap-3 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold">{s.title}</h3>
                    <p className="text-xs text-muted-foreground">{s.channel}</p>
                  </div>
                  <CopyButton
                    text={s.text}
                    toastMessage={`${s.title} copied`}
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-xl"
                  />
                </div>
                <p className="flex-1 rounded-xl border border-border/70 bg-background/60 p-3 text-sm whitespace-pre-line">
                  {s.text}
                </p>
              </article>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
