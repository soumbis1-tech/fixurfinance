import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/trips")({
  head: () => ({ meta: [{ title: "Trips" }] }),
  component: () => (
    <PhaseStub title="Trips" phase="Phase 2">
      Create trips (e.g. &ldquo;Pondy-Mahabali Trip&rdquo;), tag expenses to them, and view a trip
      report with totals by category and by member.
    </PhaseStub>
  ),
});
