import { TerminalSquare } from "lucide-react";
import { cn } from "@/ui/lib/utils";

export type TerminalEntry = {
  command: string;
  response?: string[];
};

type TerminalProps = {
  title: string;
  entries: TerminalEntry[];
  className?: string;
};

export function Terminal({ title, entries, className }: TerminalProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-[#060b16] shadow-cyan-soft", className)}>
      <div className="flex min-h-11 items-center justify-between border-b border-border bg-white/[0.035] px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TerminalSquare aria-hidden="true" className="size-4 text-cyan-200" />
          <span>{title}</span>
        </div>
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-300/80" />
          <span className="size-2.5 rounded-full bg-emerald-300/80" />
        </div>
      </div>
      <div className="space-y-5 overflow-x-auto p-5 font-mono text-sm leading-6 scrollbar-none">
        {entries.map((entry) => (
          <div className="min-w-max" key={entry.command}>
            <div>
              <span className="text-emerald-200">genesis@lab</span>
              <span className="text-muted-foreground">:~$ </span>
              <span className="text-cyan-100">{entry.command}</span>
            </div>
            {entry.response?.map((line) => (
              <div className="text-muted-foreground" key={line}>{line}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
