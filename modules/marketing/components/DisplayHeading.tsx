import { cn } from '@/lib/utils';

interface DisplayHeadingProps {
  as?: 'h1' | 'h2' | 'h3';
  children: React.ReactNode;
  className?: string;
}

/** Bricolage Grotesque display headline — reserved for big section headings only. */
export function DisplayHeading({ as: Tag = 'h2', children, className }: DisplayHeadingProps) {
  return (
    <Tag
      className={cn(
        'text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl',
        className
      )}
    >
      {children}
    </Tag>
  );
}
