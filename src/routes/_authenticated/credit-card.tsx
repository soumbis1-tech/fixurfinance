import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { usePaymentAccounts } from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Status = "unpaid" | "paid" | "reimbursed" | "disputed";

export const Route = createFileRoute("/_authenticated/credit-card")({
  head: () => ({ meta: [{ title: "Credit card" }] }),
  component: CreditCardPage,
});

function CreditCardPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();

  const list = useQuery({
    enabled: !!familyId,
    queryKey: ["credit_card_items", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_items")
        .select("id, item, amount, date, status, payment_account_id, notes")
        .eq("family_id", familyId!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase
        .from("credit_card_items")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credit_card_items"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_card_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["credit_card_items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = (list.data ?? []).reduce(
    (acc, r) => {
      acc.all += Number(r.amount);
      if (r.status === "unpaid") acc.unpaid += Number(r.amount);
      return acc;
    },
    { all: 0, unpaid: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Credit Card</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} item(s) · Outstanding {formatMoney(totals.unpaid, currency)}
          </p>
        </div>
        <NewItemDialog familyId={familyId} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">
            No credit-card items yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2">
                    {r.item}
                    {r.notes && (
                      <div className="text-xs text-muted-foreground">{r.notes}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(r.amount, currency)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      onChange={(e) =>
                        update.mutate({ id: r.id, status: e.target.value as Status })
                      }
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                      <option value="reimbursed">Reimbursed</option>
                      <option value="disputed">Disputed</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => del.mutate(r.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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

function NewItemDialog({ familyId }: { familyId: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const accounts = usePaymentAccounts(familyId);

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      const { error } = await supabase.from("credit_card_items").insert({
        family_id: familyId,
        item,
        amount: Number(amount),
        date,
        status: "unpaid",
        payment_account_id: accountId || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added");
      qc.invalidateQueries({ queryKey: ["credit_card_items"] });
      setOpen(false);
      setItem("");
      setAmount("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New credit-card item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Input value={item} onChange={(e) => setItem(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Card / account</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— None —</option>
              {accounts.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.masked_number ? ` (${a.masked_number})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!item || !amount || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
