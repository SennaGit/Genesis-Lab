import type { SiteNavItem } from "@/ui/components/site-header";

export const site = {
  brand: "Genesis Lab",
  tagline: "CLI Research Runtime OS",
  githubUrl: "https://github.com/SennaGit/Genesis-Lab",
  description:
    "A CLI-first research runtime for Research DAG planning, tool execution, critic-driven replanning, and evidence-backed synthesis."
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
      { label: "CLI", href: "/cli" }
    ]
  },
  {
    title: "Build",
    items: [
      { label: "Skills and MCP", href: "/api" },
      { label: "Product Philosophy", href: "/philosophy" },
      { label: "Open Source", href: "/community" }
    ]
  }
];
