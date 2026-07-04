import { Layers3 } from "lucide-react";
import { Badge } from "@/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { architectureLayers } from "./content";

export function ArchitecturePage() {
  return (
    <SectionShell
      className="min-h-[calc(100vh-4rem)]"
      description="The system is organized as layered responsibilities so routing, agents, research planning, computation, and artifact generation can evolve independently."
      eyebrow="Architecture"
      title="A layered research system from command line to artifact."
    >
      <div className="relative grid gap-3">
        {architectureLayers.map((layer, index) => (
          <Card className="relative overflow-hidden" key={layer.name}>
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan-300 via-violet-300 to-emerald-300"
            />
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={index % 2 === 0 ? "default" : "secondary"}>Layer {index + 1}</Badge>
                <CardTitle className="flex items-center gap-2">
                  <Layers3 aria-hidden="true" className="size-5 text-cyan-100" />
                  {layer.name}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              {layer.detail}
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
}
