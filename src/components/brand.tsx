import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="1 Mercado logo"
      width={504}
      height={495}
      className={cn('size-12 object-contain', className)}
    />
  )
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <Link to="/" className="flex items-center gap-3">
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-lg font-bold tracking-tight">
          1MERCADO
        </span>
        {subtitle ? (
          <span className="block text-xs font-medium text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
