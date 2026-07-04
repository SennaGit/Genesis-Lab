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
      description="The command line surface exposes the currently available research runtime commands: genesis run, genesis compile, genesis status, and genesis report."
      eyebrow="CLI / Agent"
      title="Operate Genesis Lab from a terminal-first workflow."
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
