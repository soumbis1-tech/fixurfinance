import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

export const Route = createFileRoute("/_authenticated/expenses/new")({
  head: () => ({ meta: [{ title: "Add expense" }] }),
  component: NewExpense,
});

function NewExpense() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add Expense</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry. Use Imports for bulk loads or bank statements.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <ExpenseForm onSaved={() => navigate({ to: "/expenses" })} />
      </div>
    </div>
  );
}
