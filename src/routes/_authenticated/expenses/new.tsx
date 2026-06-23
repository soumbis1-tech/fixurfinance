import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/expenses/new")({
  head: () => ({ meta: [{ title: "Add expense" }] }),
  component: () => (
    <PhaseStub title="Add Expense" phase="Phase 2">
      Manual entry form with all fields you described — date, description, amount, paid by,
      category, payment account, type, comments, reimbursable, receipt upload, and save / save &
      add-another.
    </PhaseStub>
  ),
});
