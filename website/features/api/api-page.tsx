import { Cable, Plug, RadioTower } from "lucide-react";
import { Badge } from "@/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { apiCapabilities, restEndpoints } from "./content";

const icons = [RadioTower, Cable, Plug];

export function ApiPage() {
  return (
    <SectionShell
      className="min-h-[calc(100vh-4rem)]"
      description="The API exposes research compilation, run creation, evidence access, report export, streaming progress, tool calling, and plugin extension points."
      eyebrow="API"
      title="Integrate Genesis Lab with research tools and internal systems."
    >
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>REST endpoints</CardTitle>
            <CardDescription>
              Core HTTP routes for task compilation, run lifecycle, evidence inspection, and artifact export.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {restEndpoints.map((endpoint) => (
                <div
                  className="grid gap-2 rounded-lg border border-border bg-white/[0.025] p-3 sm:grid-cols-[86px_1fr]"
                  key={`${endpoint.method}-${endpoint.path}`}
                >
                  <Badge variant={endpoint.method === "POST" ? "default" : "secondary"}>
                    {endpoint.method}
                  </Badge>
                  <div className="min-w-0">
                    <div className="overflow-x-auto font-mono text-sm text-cyan-100 scrollbar-none">
                      {endpoint.path}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">
                      {endpoint.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          {apiCapabilities.map((capability, index) => {
            const Icon = icons[index];

            return (
              <Card key={capability.title}>
                <CardHeader>
                  <Icon aria-hidden="true" className="size-5 text-violet-100" />
                  <CardTitle className="text-base">{capability.title}</CardTitle>
                  <CardDescription>{capability.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
