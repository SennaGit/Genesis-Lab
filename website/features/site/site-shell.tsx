import type { ReactNode } from "react";
import { SiteFooter } from "@/ui/components/site-footer";
import { SiteHeader } from "@/ui/components/site-header";
import { footerGroups, navItems, site } from "./content";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="min-h-screen bg-background/30 text-foreground">
      <SiteHeader
        brand={site.brand}
        githubUrl={site.githubUrl}
        navItems={navItems}
        tagline={site.tagline}
      />
      <main>{children}</main>
      <SiteFooter brand={site.brand} description={site.description} groups={footerGroups} />
    </div>
  );
}
