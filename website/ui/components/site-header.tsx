import Link from "next/link";
import { Github, Sparkles } from "lucide-react";
import { Button } from "@/ui/components/button";
import { cn } from "@/ui/lib/utils";

export type SiteNavItem = {
  label: string;
  href: string;
};

type SiteHeaderProps = {
  brand: string;
  tagline: string;
  navItems: SiteNavItem[];
  githubUrl: string;
};

export function SiteHeader({ brand, tagline, navItems, githubUrl }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/[0.82] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:min-h-[72px] lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link className="flex min-w-0 items-center gap-3" href="/">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5 text-foreground">{brand}</span>
            <span className="block truncate text-xs leading-5 text-muted-foreground">{tagline}</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <nav
            aria-label="Primary navigation"
            className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg border border-border bg-white/[0.025] p-1 lg:flex-initial"
          >
            {navItems.map((item) => (
              <Link
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors",
                  "hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button asChild size="sm" variant="outline">
            <a href={githubUrl} rel="noreferrer" target="_blank">
              <Github aria-hidden="true" />
              GitHub
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
