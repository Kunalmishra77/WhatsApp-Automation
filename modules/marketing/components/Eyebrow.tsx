import { cn } from '@/lib/utils';

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p className={cn('mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-500', className)}>
      {children}
    </p>
  );
}
