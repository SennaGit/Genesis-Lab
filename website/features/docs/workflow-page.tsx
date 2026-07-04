import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/ui/components/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { workflowSteps } from "./content";

export function WorkflowPage() {
  return (
    <SectionShell
      className="min-h-[calc(100vh-4rem)]"
      description="The research pipeline is explicit: Literature -> Hypothesis -> Compute -> Validation -> Artifact."
      eyebrow="Research Workflow"
      title="Move from evidence gathering to a reviewable research artifact."
    >
      <div className="grid gap-5">
        <div className="grid gap-3 rounded-lg border border-border bg-card/70 p-4 sm:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <div className="min-w-0" key={step.name}>
              <div className="flex items-center gap-2">
                <Badge variant={index === workflowSteps.length - 1 ? "accent" : "muted"}>
                  {String(index + 1).padStart(2, "0")}
                </Badge>
                {index < workflowSteps.length - 1 ? (
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="hidden size-4 text-emerald-200 sm:block" />
                )}
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{step.name}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {workflowSteps.map((step) => (
            <Card key={step.name}>
              <CardHeader>
                <CardTitle>{step.name}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
