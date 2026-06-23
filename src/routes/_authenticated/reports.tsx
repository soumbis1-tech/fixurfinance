import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: () => (
    <PhaseStub title="Reports" phase="Phase 5">
      Daily / weekly / monthly breakdowns, category and member analysis, custom date ranges, CSV
      export and email.
    </PhaseStub>
  ),
});
