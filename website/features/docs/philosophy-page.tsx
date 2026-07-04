import { Brain, GitBranch, ShieldCheck } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { philosophyItems } from "./content";

const icons = [ShieldCheck, GitBranch, Brain];

export function PhilosophyPage() {
  return (
    <SectionShell
      className="min-h-[calc(100vh-4rem)]"
      description="Genesis Lab treats AI as a research collaborator whose steps must be visible, replayable, and open to correction."
      eyebrow="Product Philosophy"
      title="Scientific AI should be inspected, not merely trusted."
    >
      <div className="grid gap-4">
        {philosophyItems.map((item, index) => {
          const Icon = icons[index];

          return (
            <Card key={item.title}>
              <CardHeader>
                <Icon aria-hidden="true" className="size-6 text-cyan-100" />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </SectionShell>
  );
}
