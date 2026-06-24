import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import {
  useCategories,
  useMembers,
  usePaymentAccounts,
  useTrips,
} from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Trash2,
  Copy,
  Check,
  Download,
  Plus,
  Search,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/expenses/")({
  head: () => ({ meta: [{ title: "Expenses" }] }),
  component: ExpensesPage,
});

type ExpenseType = "expense" | "investment" | "reimbursement" | "income" | "transfer";
type ReimbStatus = "not_applicable" | "pending" | "reimbursed";
type Row = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: ExpenseType;
  paid_by: string | null;
  category_id: string | null;
  payment_account_id: string | null;
  trip_id: string | null;
  reimbursable: boolean;
  reimbursement_status: ReimbStatus;
  source: string;
  comments: string | null;
};

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function ExpensesPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(todayMinus(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [accountId, setAccountId] = useState("");
  const [tripId, setTripId] = useState("");
  const [reimbursableOnly, setReimbursableOnly] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const cats = useCategories(familyId);
  const members = useMembers(familyId);
  const accounts = usePaymentAccounts(familyId);
  const trips = useTrips(familyId);

  const catMap = useMemo(
    () => Object.fromEntries((cats.data ?? []).map((c) => [c.id, c.name])),
    [cats.data],
  );
  const memberMap = useMemo(
    () => Object.fromEntries((members.data ?? []).map((m) => [m.id, m.display_name])),
    [members.data],
  );
  const accountMap = useMemo(
    () => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  );
  const tripMap = useMemo(
    () => Object.fromEntries((trips.data ?? []).map((t) => [t.id, t.name])),
    [trips.data],
  );

  const list = useQuery({
    enabled: !!familyId,
    queryKey: [
      "expenses",
      familyId,
      { search, from, to, type, categoryId, paidBy, accountId, tripId, reimbursableOnly },
    ],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select(
          "id, date, description, amount, type, paid_by, category_id, payment_account_id, trip_id, reimbursable, reimbursement_status, source, comments",
        )
        .eq("family_id", familyId!)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (type) q = q.eq("type", type as "expense");
      if (categoryId) q = q.eq("category_id", categoryId);
      if (paidBy) q = q.eq("paid_by", paidBy);
      if (accountId) q = q.eq("payment_account_id", accountId);
      if (tripId) q = q.eq("trip_id", tripId);
      if (reimbursableOnly) q = q.eq("reimbursable", true);
      if (search.trim()) q = q.ilike("description", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const total = useMemo(
    () => (list.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    [list.data],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Deleted");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (row: Row) => {
      const { id: _id, ...rest } = row as Row & { id: string };
      void _id;
      const { error } = await supabase.from("expenses").insert({
        ...rest,
        family_id: familyId!,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markReimbursed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("expenses")
        .update({ reimbursement_status: "reimbursed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Marked reimbursed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCSV() {
    const rows = list.data ?? [];
    const header = [
      "Date",
      "Description",
      "Amount",
      "Type",
      "Category",
      "Paid By",
      "Account",
      "Trip",
      "Reimbursable",
      "Reimbursement Status",
      "Source",
      "Comments",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.date,
        r.description,
        r.amount,
        r.type,
        catMap[r.category_id ?? ""] ?? "",
        memberMap[r.paid_by ?? ""] ?? "",
        accountMap[r.payment_account_id ?? ""] ?? "",
        tripMap[r.trip_id ?? ""] ?? "",
        r.reimbursable ? "yes" : "no",
        r.reimbursement_status,
        r.source,
        r.comments ?? "",
      ].map((c) => {
        const s = String(c ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} row(s) · Total {formatMoney(total, currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Link to="/expenses/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search description"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <FilterSelect
          value={type}
          onChange={setType}
          options={[
            { value: "", label: "All types" },
            { value: "expense", label: "Expense" },
            { value: "investment", label: "Investment" },
            { value: "income", label: "Income" },
            { value: "reimbursement", label: "Reimbursement" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
        <FilterSelect
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: "", label: "All categories" },
            ...(cats.data?.map((c) => ({ value: c.id, label: c.name })) ?? []),
          ]}
        />
        <FilterSelect
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: "", label: "All members" },
            ...(members.data?.map((m) => ({ value: m.id, label: m.display_name })) ?? []),
          ]}
        />
        <FilterSelect
          value={accountId}
          onChange={setAccountId}
          options={[
            { value: "", label: "All accounts" },
            ...(accounts.data?.map((a) => ({ value: a.id, label: a.name })) ?? []),
          ]}
        />
        <FilterSelect
          value={tripId}
          onChange={setTripId}
          options={[
            { value: "", label: "All trips" },
            ...(trips.data?.map((t) => ({ value: t.id, label: t.name })) ?? []),
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reimbursableOnly}
            onChange={(e) => setReimbursableOnly(e.target.checked)}
          />
          Reimbursable only
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (list.data?.length ?? 0) === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">
            No expenses match these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Paid by</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2">
                    <div>{r.description}</div>
                    {r.reimbursable && (
                      <span
                        className={`inline-block text-[10px] uppercase rounded px-1.5 py-0.5 mt-0.5 ${
                          r.reimbursement_status === "reimbursed"
                            ? "bg-green-500/15 text-green-600"
                            : "bg-amber-500/15 text-amber-600"
                        }`}
                      >
                        {r.reimbursement_status === "reimbursed"
                          ? "Reimbursed"
                          : "Reimbursable"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {catMap[r.category_id ?? ""] ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {memberMap[r.paid_by ?? ""] ?? "—"}
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{r.type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(r.amount, currency)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      {r.reimbursable && r.reimbursement_status !== "reimbursed" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Mark reimbursed"
                          onClick={() => markReimbursed.mutate(r.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Duplicate"
                        onClick={() => duplicate.mutate(r)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Link
                        to="/expenses/$id/edit"
                        params={{ id: r.id }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The row is removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && del.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
