import { Command, FileText, Route } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { Terminal } from "@/ui/components/terminal";
import { cliCommands, cliPanels } from "./content";

const icons = [Route, Command, FileText];

export function CliPage() {
  return (
    <SectionShell
      className="min-h-[calc(100vh-4rem)]"
      description="The command line surface exposes the TypeScript Research Runtime: run, chat, resume, status, report, skills, mcp, config, and doctor."
      eyebrow="CLI Runtime"
      title="Operate Genesis Lab as a terminal-first research runtime."
    >
      <div className="grid gap-5" id="commands">
        <Terminal entries={cliCommands} title="Genesis CLI" />
        <div className="grid gap-4 sm:grid-cols-3">
          {cliPanels.map((panel, index) => {
            const Icon = icons[index];

            return (
              <Card key={panel.title}>
                <CardHeader>
                  <Icon aria-hidden="true" className="size-5 text-cyan-100" />
                  <CardTitle className="text-base">{panel.title}</CardTitle>
                  <CardDescription>{panel.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
