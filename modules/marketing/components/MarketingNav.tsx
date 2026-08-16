'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/security' },
  { label: 'Docs', href: '/docs' },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkClass = cn(
    'text-sm font-medium transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    scrolled ? 'text-navy-900/70 hover:text-navy-900 focus-visible:ring-offset-white' : 'text-white/80 hover:text-white focus-visible:ring-offset-navy-900'
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-colors duration-300',
        scrolled ? 'border-b border-navy-900/10 bg-white/95 shadow-sm backdrop-blur-md' : 'border-b border-transparent bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="AGENTiX home">
          <Image
            src={scrolled ? '/agentix-wordmark.png' : '/agentix-wordmark-white.png'}
            alt="AGENTiX"
            width={150}
            height={38}
            className="h-8 w-auto sm:h-9"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
          <Button asChild size="sm" className="bg-brand-500 text-white hover:bg-brand-600">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        {/* Mobile */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:hidden',
                scrolled ? 'text-navy-900' : 'text-white'
              )}
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-[300px] flex-col sm:w-[350px]">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="mt-6 flex flex-col gap-8">
              <Image src="/agentix-wordmark.png" alt="AGENTiX" width={140} height={34} className="h-8 w-auto" />
              <nav className="flex flex-col gap-5" aria-label="Mobile">
                {NAV_LINKS.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="text-base font-medium text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="flex flex-col gap-3 border-t border-border pt-6">
                <SheetClose asChild>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-navy-900/70 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Log in
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild className="bg-brand-500 text-white hover:bg-brand-600">
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
