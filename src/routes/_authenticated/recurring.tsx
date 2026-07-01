import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { formatMoney } from "@/lib/format";
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
import { Loader2, Plus, ChevronLeft, ChevronRight, Check, Circle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCategories, useMembers } from "@/hooks/use-family-lookups";

export const Route = createFileRoute("/_authenticated/recurring")({
  head: () => ({ meta: [{ title: "Recurring" }] }),
  component: RecurringPage,
});

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type ExpType = "expense" | "investment";

const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

type RecurringRow = {
  id: string;
  item: string;
  amount: number;
  type: ExpType;
  frequency: Frequency;
  due_day: number;
  active: boolean;
  category_id: string | null;
  paid_by: string | null;
  notes: string | null;
};

function RecurringPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const members = useMembers(familyId);

  const items = useQuery({
    enabled: !!familyId,
    queryKey: ["recurring", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("id, item, amount, type, frequency, due_day, active, category_id, paid_by, notes")
        .eq("family_id", familyId!)
        .eq("active", true)
        .order("item");
      if (error) throw error;
      return (data ?? []) as RecurringRow[];
    },
  });

  const statuses = useQuery({
    enabled: !!familyId,
    queryKey: ["recurring_status", familyId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_payment_status")
        .select("recurring_id, status, paid_on")
        .eq("family_id", familyId!)
        .eq("period_year", year)
        .eq("period_month", month);
      if (error) throw error;
      const map: Record<string, { status: string; paid_on: string | null }> = {};
      for (const r of data ?? []) map[r.recurring_id] = { status: r.status, paid_on: r.paid_on };
      return map;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ recurringId, status }: { recurringId: string; status: "paid" | "due" }) => {
      const { error } = await supabase.from("recurring_payment_status").upsert(
        {
          family_id: familyId!,
          recurring_id: recurringId,
          period_year: year,
          period_month: month,
          status,
          paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : null,
        },
        { onConflict: "recurring_id,period_year,period_month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring_status"] });
      qc.invalidateQueries({ queryKey: ["recurring_unpaid"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_expenses").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["recurring"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  const memberName = (id: string | null) => members.data?.find((m) => m.id === id)?.display_name ?? "—";

  const totalDue = (items.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const paidTotal = (items.data ?? [])
    .filter((r) => statuses.data?.[r.id]?.status === "paid")
    .reduce((s, r) => s + Number(r.amount), 0);

  const [editing, setEditing] = useState<RecurringRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            Monthly checklist · Paid {formatMoney(paidTotal, currency)} of {formatMoney(totalDue, currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-32 text-center">
            {new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <RecurringDialog familyId={familyId} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {items.isLoading ? (
          <div className="p-8 flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (items.data?.length ?? 0) === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">
            No recurring items yet. Click &ldquo;Add recurring&rdquo; to create one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium w-16">Paid</th>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium">Paid By</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Payment Schedule</th>
                <th className="px-4 py-2 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.data?.map((r) => {
                const st = statuses.data?.[r.id]?.status;
                const isPaid = st === "paid";
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <button
                        onClick={() =>
                          setStatus.mutate({ recurringId: r.id, status: isPaid ? "due" : "paid" })
                        }
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                          isPaid
                            ? "bg-green-500/20 border-green-500 text-green-600"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                        title={isPaid ? "Mark unpaid" : "Mark paid"}
                      >
                        {isPaid ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="px-4 py-2">{r.item}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{memberName(r.paid_by)}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{r.type}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{r.frequency}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Remove "${r.item}"?`)) removeItem.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RecurringDialog
          familyId={familyId}
          initial={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

function RecurringDialog({
  familyId,
  initial,
  open: controlledOpen,
  onOpenChange,
}: {
  familyId: string | undefined;
  initial?: RecurringRow;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = controlledOpen ?? openState;
  const setOpen = onOpenChange ?? setOpenState;

  const [item, setItem] = useState(initial?.item ?? "");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [dueDay, setDueDay] = useState(initial?.due_day ?? 1);
  const [type, setType] = useState<ExpType>(initial?.type ?? "expense");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "monthly");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? "");
  const cats = useCategories(familyId);
  const members = useMembers(familyId);

  const save = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      const payload = {
        family_id: familyId,
        item,
        amount: Number(amount),
        type,
        frequency,
        due_day: dueDay,
        active: true,
        category_id: categoryId || null,
        paid_by: paidBy || null,
      };
      if (initial) {
        const { error } = await supabase.from("recurring_expenses").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Updated" : "Added");
      qc.invalidateQueries({ queryKey: ["recurring"] });
      setOpen(false);
      if (!initial) {
        setItem("");
        setAmount("");
        setDueDay(1);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trigger = !initial ? (
    <DialogTrigger asChild>
      <Button size="sm">
        <Plus className="h-4 w-4 mr-1" /> Add recurring
      </Button>
    </DialogTrigger>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit recurring item" : "New recurring item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Input value={item} onChange={(e) => setItem(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due day (1-31)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as ExpType)}
              >
                <option value="expense">Expense</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Schedule</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm capitalize"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f} className="capitalize">
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— None —</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                <option value="">— None —</option>
                {members.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!item || !amount || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
