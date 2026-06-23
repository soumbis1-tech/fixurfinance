import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/credit-card")({
  head: () => ({ meta: [{ title: "Credit card" }] }),
  component: () => (
    <PhaseStub title="Credit Card" phase="Phase 2">
      Track credit-card items with Paid / Unpaid / Reimbursed / Disputed status and link them to
      expenses.
    </PhaseStub>
  ),
});
