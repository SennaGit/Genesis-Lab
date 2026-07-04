import Link from "next/link";
import { Separator } from "@/ui/components/separator";
import type { SiteNavItem } from "@/ui/components/site-header";

type FooterGroup = {
  title: string;
  items: SiteNavItem[];
};

type SiteFooterProps = {
  brand: string;
  description: string;
  groups: FooterGroup[];
};

export function SiteFooter({ brand, description, groups }: SiteFooterProps) {
  return (
    <footer className="border-t border-border bg-background/[0.76]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="text-base font-semibold text-foreground">{brand}</div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="text-sm font-semibold text-foreground">{group.title}</div>
                <div className="mt-3 grid gap-2">
                  {group.items.map((item) => (
                    <Link className="text-sm text-muted-foreground hover:text-foreground" href={item.href} key={item.href}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Separator className="my-8" />
        <div className="text-xs text-muted-foreground">
          Genesis Lab is built for auditable scientific workflows, reproducible computation, and research artifacts that can be reviewed.
        </div>
      </div>
    </footer>
  );
}
