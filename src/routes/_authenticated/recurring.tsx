import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { formatMoney } from "@/lib/format";
import { Loader2 } from "lucide-react";
export const Route = createFileRoute("/_authenticated/recurring")({
  head: () => ({ meta: [{ title: "Recurring" }] }),
  component: RecurringPage,
});

function RecurringPage() {
  const { activeFamily } = useActiveFamily();
  const q = useQuery({
    enabled: !!activeFamily?.id,
    queryKey: ["recurring", activeFamily?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("id, item, amount, type, due_day, active")
        .eq("family_id", activeFamily!.id)
        .order("item");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recurring</h1>
      <p className="text-sm text-muted-foreground">
        These are your starter recurring items. Editing amounts, the monthly paid/unpaid checklist
        and auto-create toggles arrive in Phase 2 — the data and RLS already work.
      </p>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Due day</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">{r.item}</td>
                  <td className="px-4 py-2 capitalize">{r.type}</td>
                  <td className="px-4 py-2">{r.due_day}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(r.amount, activeFamily?.currency ?? "INR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
