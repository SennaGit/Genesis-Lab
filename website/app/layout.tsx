import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteShell } from "@/features/site/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis Lab",
  description: "AI Scientific Research Workbench: From Literature to Computation to Artifact"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className="dark" lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
