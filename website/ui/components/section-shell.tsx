import type { ReactNode } from "react";
import { Badge } from "@/ui/components/badge";
import { cn } from "@/ui/lib/utils";

type SectionShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionShell({
  eyebrow,
  title,
  description,
  children,
  actions,
  className,
  contentClassName
}: SectionShellProps) {
  return (
    <section className={cn("mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8", className)}>
      <div className={cn("grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-start", contentClassName)}>
        <div className="min-w-0">
          {eyebrow ? <Badge variant="muted">{eyebrow}</Badge> : null}
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
