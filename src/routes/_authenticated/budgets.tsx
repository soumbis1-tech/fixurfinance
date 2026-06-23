import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets" }] }),
  component: () => (
    <PhaseStub title="Budgets" phase="Phase 5">
      Monthly category budgets with progress bars, overspending alerts, and goals / sinking funds
      for trips, emergencies, school costs, etc.
    </PhaseStub>
  ),
});
