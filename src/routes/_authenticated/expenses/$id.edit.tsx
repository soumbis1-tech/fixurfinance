import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses/$id/edit")({
  head: () => ({ meta: [{ title: "Edit expense" }] }),
  component: EditExpense,
});

export const Route = createFileRoute("/_authenticated/expenses/$id/edit")({
  head: () => ({ meta: [{ title: "Edit expense" }] }),
  component: EditExpense,
});

function EditExpense() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, date, description, amount, type, paid_by, category_id, payment_account_id, trip_id, comments, reimbursable, reimbursement_status, receipt_path",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit Expense</h1>
      <div className="rounded-xl border border-border bg-card p-5">
        {q.isLoading ? (
          <div className="flex items-center text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : q.data ? (
          <ExpenseForm
            initial={{
              ...q.data,
              amount: Number(q.data.amount),
            }}
            onSaved={() => navigate({ to: "/expenses" })}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Not found.</p>
        )}
      </div>
    </div>
  );
}
