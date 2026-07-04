import Link from "next/link";
import { ArrowRight, Github, Play, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/components/card";
import { SectionShell } from "@/ui/components/section-shell";
import { site } from "@/features/site/content";
import { capabilityCards, hero, heroSignals, workbenchFrames } from "./content";

export function HomePage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(56,213,255,0.13),transparent_38%),linear-gradient(260deg,rgba(167,139,250,0.16),transparent_42%)]" />
          <div className="absolute left-1/2 top-8 h-[560px] w-[880px] -translate-x-1/2 rounded-[48px] border border-cyan-300/10 bg-white/[0.025] shadow-cyan-soft" />
          <div className="absolute left-[6%] top-24 hidden w-52 rounded-lg border border-border bg-card/70 p-4 backdrop-blur md:block">
            <div className="text-xs text-cyan-100">pipeline.status</div>
            <div className="mt-3 h-2 rounded-full bg-cyan-300/60" />
            <div className="mt-2 h-2 w-2/3 rounded-full bg-violet-300/50" />
          </div>
          <div className="absolute bottom-12 right-[7%] hidden w-60 rounded-lg border border-border bg-card/70 p-4 backdrop-blur lg:block">
            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>literature -&gt; hypothesis</span>
              <span>compute -&gt; validation</span>
              <span className="text-emerald-100">artifact.ready</span>
            </div>
          </div>
        </div>
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:px-8">
          <div className="min-w-0">
            <Badge>AI Scientific Research Workbench</Badge>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-none text-foreground sm:text-6xl lg:text-7xl">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-2xl font-medium leading-tight text-cyan-50 sm:text-3xl">
              {hero.headline}
            </p>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">{hero.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/cli">
                  Get Started
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={site.githubUrl} rel="noreferrer" target="_blank">
                  <Github aria-hidden="true" />
                  View GitHub
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/cli#commands">
                  <Play aria-hidden="true" />
                  Run genesis
                </Link>
              </Button>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {heroSignals.map((signal) => (
                <div className="rounded-lg border border-border bg-card/70 p-3" key={signal.label}>
                  <div className="text-xs text-muted-foreground">{signal.label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{signal.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-h-[420px] min-w-0">
            <div className="absolute inset-0 rounded-lg border border-border bg-[#070d19]/[0.88] p-4 shadow-purple-soft backdrop-blur">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="text-sm font-semibold text-cyan-100">Workbench trace</div>
                <div className="rounded-full border border-emerald-300/40 px-2 py-1 text-xs text-emerald-100">
                  reviewable
                </div>
              </div>
              <div className="mt-5 grid gap-4">
                {workbenchFrames.map((frame, index) => (
                  <div className="rounded-lg border border-border bg-white/[0.035] p-4" key={frame.title}>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                        {index + 1}
                      </span>
                      <div className="font-semibold text-foreground">{frame.title}</div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{frame.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionShell
        description="Genesis Lab connects planning, agent execution, computation, and artifact building into one reviewable system."
        eyebrow="Capabilities"
        title="A workbench for scientific reasoning that leaves a trail."
      >
        <div className="grid gap-4">
          {capabilityCards.map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </SectionShell>

      <section className="border-t border-border bg-white/[0.018]">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8">
          <Card className="bg-cyan-300/[0.08]">
            <CardHeader>
              <ShieldCheck aria-hidden="true" className="size-6 text-cyan-100" />
              <CardTitle>Auditable by default</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Runs preserve the path from question to evidence, from computation to conclusion, and from agent step to generated artifact.
            </CardContent>
          </Card>
          <Card className="bg-violet-300/[0.08]">
            <CardHeader>
              <Workflow aria-hidden="true" className="size-6 text-violet-100" />
              <CardTitle>Modular enough to extend</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              The CLI, agents, research engine, compute layer, and artifact builder can evolve independently behind clear interfaces.
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
