import type { SiteNavItem } from "@/ui/components/site-header";

export const site = {
  brand: "Genesis Lab",
  tagline: "AI Scientific Research Workbench",
  githubUrl: "https://github.com/SennaGit/Genesis-Lab",
  description:
    "A research workbench for auditable AI workflows, modular scientific pipelines, local agent execution, and artifact generation."
};

export const navItems: SiteNavItem[] = [
  { label: "Philosophy", href: "/philosophy" },
  { label: "Architecture", href: "/architecture" },
  { label: "CLI", href: "/cli" },
  { label: "Workflow", href: "/workflow" },
  { label: "API", href: "/api" },
  { label: "Community", href: "/community" }
];

export const footerGroups = [
  {
    title: "Product",
    items: [
      { label: "Architecture", href: "/architecture" },
      { label: "Research Workflow", href: "/workflow" },
      { label: "API", href: "/api" }
    ]
  },
  {
    title: "Build",
    items: [
      { label: "CLI / Agent", href: "/cli" },
      { label: "Product Philosophy", href: "/philosophy" },
      { label: "Open Source", href: "/community" }
    ]
  }
];
