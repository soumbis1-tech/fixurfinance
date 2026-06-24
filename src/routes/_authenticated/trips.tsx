import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useTrips, useCategories, useMembers } from "@/hooks/use-family-lookups";
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
import { formatDate, formatMoney } from "@/lib/format";
import { Plus, Loader2, Plane } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trips")({
  head: () => ({ meta: [{ title: "Trips" }] }),
  component: TripsPage,
});

function TripsPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const trips = useTrips(familyId);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedTrip = trips.data?.find((t) => t.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trips</h1>
          <p className="text-sm text-muted-foreground">
            Group expenses by trip and view per-trip breakdowns.
          </p>
        </div>
        <NewTripDialog familyId={familyId} />
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {trips.isLoading ? (
            <div className="p-6 flex items-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (trips.data?.length ?? 0) === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No trips yet.</div>
          ) : (
            <ul>
              {trips.data?.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40 ${
                      selected === t.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                      {t.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.start_date ? formatDate(t.start_date) : "—"} ·{" "}
                      {t.end_date ? formatDate(t.end_date) : "ongoing"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          {!selectedTrip ? (
            <p className="text-sm text-muted-foreground">
              Select a trip on the left to see its report.
            </p>
          ) : (
            <TripReport
              tripId={selectedTrip.id}
              tripName={selectedTrip.name}
              familyId={familyId!}
              currency={currency}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TripReport({
  tripId,
  tripName,
  familyId,
  currency,
}: {
  tripId: string;
  tripName: string;
  familyId: string;
  currency: string;
}) {
  const cats = useCategories(familyId);
  const members = useMembers(familyId);
  const q = useQuery({
    queryKey: ["trip_expenses", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, date, description, amount, category_id, paid_by")
        .eq("family_id", familyId)
        .eq("trip_id", tripId)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = (q.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const byCat: Record<string, number> = {};
  const byMember: Record<string, number> = {};
  for (const r of q.data ?? []) {
    byCat[r.category_id ?? ""] = (byCat[r.category_id ?? ""] ?? 0) + Number(r.amount);
    byMember[r.paid_by ?? ""] = (byMember[r.paid_by ?? ""] ?? 0) + Number(r.amount);
  }

  const catMap = Object.fromEntries((cats.data ?? []).map((c) => [c.id, c.name]));
  const memberMap = Object.fromEntries((members.data ?? []).map((m) => [m.id, m.display_name]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tripName}</h2>
        <p className="text-sm text-muted-foreground">
          {q.data?.length ?? 0} expenses · Total {formatMoney(total, currency)}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <SummaryList
          title="By category"
          items={Object.entries(byCat).map(([k, v]) => ({
            label: catMap[k] ?? "Uncategorised",
            value: v,
          }))}
          currency={currency}
        />
        <SummaryList
          title="By member"
          items={Object.entries(byMember).map(([k, v]) => ({
            label: memberMap[k] ?? "Unassigned",
            value: v,
          }))}
          currency={currency}
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Expenses</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          {(q.data?.length ?? 0) === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No expenses tagged to this trip yet. Add one from{" "}
              <span className="font-medium">Add Expense</span>.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{formatDate(r.date)}</td>
                    <td className="px-3 py-2">{r.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryList({
  title,
  items,
  currency,
}: {
  title: string;
  items: { label: string; value: number }[];
  currency: string;
}) {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border border-border p-3">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((it) => (
            <li key={it.label} className="flex items-center justify-between text-sm">
              <span>{it.label}</span>
              <span className="tabular-nums">{formatMoney(it.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTripDialog({ familyId }: { familyId: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family");
      const { error } = await supabase.from("trips").insert({
        family_id: familyId,
        name,
        start_date: start || null,
        end_date: end || null,
        notes: notes || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trip created");
      qc.invalidateQueries({ queryKey: ["trips"] });
      setOpen(false);
      setName("");
      setStart("");
      setEnd("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> New trip
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New trip</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
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
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
