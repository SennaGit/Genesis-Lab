import { Github, GitPullRequest, Users } from "lucide-react";
import { Button } from "@/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { site } from "@/features/site/content";
import { communityModel } from "./content";

const icons = [GitPullRequest, Users, Github];

export function CommunityPage() {
  return (
    <SectionShell
      actions={
        <Button asChild>
          <a href={site.githubUrl} rel="noreferrer" target="_blank">
            <Github aria-hidden="true" />
            Open GitHub
          </a>
        </Button>
      }
      className="min-h-[calc(100vh-4rem)]"
      description="Genesis Lab is open source and designed for researchers and builders who want transparent AI research infrastructure."
      eyebrow="Open Source"
      title="Build the research workbench in the open."
    >
      <div className="grid gap-4">
        {communityModel.map((item, index) => {
          const Icon = icons[index];

          return (
            <Card key={item.title}>
              <CardHeader>
                <Icon aria-hidden="true" className="size-6 text-violet-100" />
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
