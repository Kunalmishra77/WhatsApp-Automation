import { cn } from '@/lib/utils';

export type SectionVariant = 'navy' | 'warm' | 'white';

const VARIANT_CLASSES: Record<SectionVariant, string> = {
  navy: 'bg-navy-900 text-white',
  warm: 'bg-warm text-navy-900',
  white: 'bg-white text-navy-900',
};

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  variant?: SectionVariant;
  /** Extra classes for the inner max-width container (padding, grid, etc). */
  containerClassName?: string;
}

/**
 * Shared section shell for marketing pages. Vertical padding + variant background live
 * together in one `cn()` call so a caller's `className` override (e.g. tighter padding)
 * merges deterministically via tailwind-merge instead of colliding on source order.
 */
export function Section({
  variant = 'white',
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn('py-20 sm:py-28', VARIANT_CLASSES[variant], className)} {...props}>
      <div className={cn('mx-auto max-w-6xl px-4 sm:px-6 lg:px-8', containerClassName)}>
        {children}
      </div>
    </section>
  );
}
