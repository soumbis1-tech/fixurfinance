import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
import { Plus, Loader2, Trash2, ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

type Status = "unpaid" | "paid" | "reimbursed" | "disputed";

// Billing cycle: statement generated on the 14th. A cycle covers
// (15 of month M) → (14 of month M+1). The cycle "label month" is M+1.
const BILL_DAY = 14;

export const Route = createFileRoute("/_authenticated/credit-card")({
  head: () => ({ meta: [{ title: "Credit card" }] }),
  component: CreditCardPage,
});

type CycleKey = { year: number; month: number }; // label month (statement month)

function cycleForDate(d: Date): CycleKey {
  // If day <= BILL_DAY, belongs to this month's statement; else next month
  const day = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day > BILL_DAY) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month };
}

function cycleRange(c: CycleKey): { start: string; end: string; statement: string } {
  // start = 15 of previous month, end = 14 of this month
  let sy = c.year, sm = c.month - 1;
  if (sm < 1) { sm = 12; sy -= 1; }
  const start = new Date(sy, sm - 1, 15);
  const end = new Date(c.year, c.month - 1, BILL_DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), statement: iso(end) };
}

function cycleLabel(c: CycleKey): string {
  const d = new Date(c.year, c.month - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function shiftCycle(c: CycleKey, delta: number): CycleKey {
  let m = c.month + delta;
  let y = c.year;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { year: y, month: m };
}

function CreditCardPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<CycleKey>(() => cycleForDate(new Date()));

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

  const markCyclePaid = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("credit_card_items")
        .update({ status: "paid" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cycle marked paid");
      qc.invalidateQueries({ queryKey: ["credit_card_items"] });
    },
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

  // Group items by cycle
  const cycles = useMemo(() => {
    const map = new Map<string, { key: CycleKey; items: typeof list.data extends undefined ? never : NonNullable<typeof list.data> }>();
    for (const r of list.data ?? []) {
      const k = cycleForDate(new Date(r.date));
      const id = `${k.year}-${k.month}`;
      if (!map.has(id)) map.set(id, { key: k, items: [] as never });
      (map.get(id)!.items as unknown as typeof list.data)!.push(r);
    }
    return map;
  }, [list.data]);

  const currentId = `${cycle.year}-${cycle.month}`;
  const currentItems = cycles.get(currentId)?.items ?? [];
  const range = cycleRange(cycle);
  const cycleTotal = currentItems.reduce((s, r) => s + Number(r.amount), 0);
  const cycleUnpaid = currentItems.filter((r) => r.status === "unpaid").reduce((s, r) => s + Number(r.amount), 0);
  const unpaidIds = currentItems.filter((r) => r.status === "unpaid").map((r) => r.id);
  const fullyPaid = currentItems.length > 0 && unpaidIds.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Credit Card</h1>
          <p className="text-sm text-muted-foreground">
            Billing cycle closes on the {BILL_DAY}th of every month
          </p>
        </div>
        <NewItemDialog familyId={familyId} defaultDate={todayISO()} />
      </div>

      {/* Cycle selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setCycle(shiftCycle(cycle, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[180px] text-center">
              <div className="font-semibold">{cycleLabel(cycle)} statement</div>
              <div className="text-xs text-muted-foreground">
                {formatDate(range.start)} → {formatDate(range.end)}
              </div>
            </div>
            <Button size="icon" variant="outline" onClick={() => setCycle(shiftCycle(cycle, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCycle(cycleForDate(new Date()))}>
              Current
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div><span className="text-muted-foreground">Total:</span> <b className="tabular-nums">{formatMoney(cycleTotal, currency)}</b></div>
            <div><span className="text-muted-foreground">Unpaid:</span> <b className="tabular-nums">{formatMoney(cycleUnpaid, currency)}</b></div>
            <Button
              size="sm"
              variant={fullyPaid ? "outline" : "default"}
              disabled={currentItems.length === 0 || fullyPaid || markCyclePaid.isPending}
              onClick={() => markCyclePaid.mutate(unpaidIds)}
            >
              {fullyPaid ? (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Paid</>
              ) : (
                <><Circle className="h-4 w-4 mr-1" /> Mark cycle paid</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Items for cycle */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : currentItems.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">
            No items in this billing cycle.
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
              {currentItems.map((r) => (
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
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td className="px-3 py-2" colSpan={2}><b>Statement total</b></td>
                <td className="px-3 py-2 text-right tabular-nums"><b>{formatMoney(cycleTotal, currency)}</b></td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Cycle history */}
      <CycleHistory
        cycles={cycles}
        currency={currency}
        onSelect={(k) => setCycle(k)}
        activeId={currentId}
      />
    </div>
  );
}

function CycleHistory({
  cycles,
  currency,
  onSelect,
  activeId,
}: {
  cycles: Map<string, { key: CycleKey; items: { id: string; amount: number; status: Status }[] }>;
  currency: string;
  onSelect: (c: CycleKey) => void;
  activeId: string;
}) {
  const rows = Array.from(cycles.entries())
    .map(([id, v]) => {
      const total = v.items.reduce((s, r) => s + Number(r.amount), 0);
      const unpaid = v.items.filter((r) => r.status === "unpaid").reduce((s, r) => s + Number(r.amount), 0);
      const paid = total - unpaid;
      return { id, key: v.key, total, unpaid, paid, count: v.items.length };
    })
    .sort((a, b) => (b.key.year - a.key.year) * 100 + (b.key.month - a.key.month));

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <div className="p-3 border-b border-border font-medium text-sm">Cycle history</div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Statement month</th>
            <th className="px-3 py-2 font-medium text-right">Items</th>
            <th className="px-3 py-2 font-medium text-right">Total</th>
            <th className="px-3 py-2 font-medium text-right">Unpaid</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const paid = r.unpaid === 0;
            return (
              <tr
                key={r.id}
                className={`border-t border-border cursor-pointer hover:bg-muted/40 ${r.id === activeId ? "bg-muted/30" : ""}`}
                onClick={() => onSelect(r.key)}
              >
                <td className="px-3 py-2">{cycleLabel(r.key)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.total, currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.unpaid, currency)}</td>
                <td className="px-3 py-2">
                  {paid ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Paid</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Circle className="h-3.5 w-3.5" /> Pending</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NewItemDialog({ familyId, defaultDate }: { familyId: string | undefined; defaultDate: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
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
