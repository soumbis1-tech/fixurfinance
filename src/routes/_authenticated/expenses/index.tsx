import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/expenses/")({
  head: () => ({ meta: [{ title: "Expenses" }] }),
  component: () => (
    <PhaseStub title="Expenses" phase="Phase 2">
      Searchable, filterable expense table with edit, delete, duplicate, mark-reimbursed, and CSV
      export. The database, RLS, and indexes are already in place.
    </PhaseStub>
  ),
});
