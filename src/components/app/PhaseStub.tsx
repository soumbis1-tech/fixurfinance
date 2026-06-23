import type { ReactNode } from "react";
import { Construction } from "lucide-react";

export function PhaseStub({ title, phase, children }: { title: string; phase: string; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="rounded-xl border border-dashed border-border bg-card p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Construction className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h2 className="font-semibold">Arriving in {phase}</h2>
            <p className="text-sm text-muted-foreground max-w-prose">{children}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
