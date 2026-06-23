import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/imports")({
  head: () => ({ meta: [{ title: "Imports" }] }),
  component: () => (
    <PhaseStub title="Imports" phase="Phase 3">
      Excel and plain-text file imports with manual column mapping, preview, duplicate detection
      (date + amount + description hash), undo last import, and auto-categorization.
    </PhaseStub>
  ),
});
