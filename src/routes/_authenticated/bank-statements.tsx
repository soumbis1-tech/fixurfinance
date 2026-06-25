import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useAuth } from "@/hooks/use-auth";
import { useCategories } from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import { Loader2, Upload, CheckCircle2, Trash2 } from "lucide-react";
import {
  RawRow,
  autoCategoryFor,
  dedupeHash,
  guessMapping,
  parseAmount,
  parseDate,
} from "@/lib/import-utils";

export const Route = createFileRoute("/_authenticated/bank-statements")({
  head: () => ({ meta: [{ title: "Bank Statements" }] }),
  component: BankStatementsPage,
});

type Mapping = { date: string; description: string; debit: string; credit: string; amount: string };
type Staged = {
  raw: RawRow;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  selected: boolean;
  duplicate: boolean;
  error?: string;
  hash: string;
};

function BankStatementsPage() {
  const { activeFamily } = useActiveFamily();
  const { user } = useAuth();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const cats = useCategories(familyId);
  const qc = useQueryClient();

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ date: "", description: "", debit: "", credit: "", amount: "" });
  const [staged, setStaged] = useState<Staged[]>([]);
  const [accountName, setAccountName] = useState("");

  const rules = useQuery({
    enabled: !!familyId,
    queryKey: ["category_rules", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_rules")
        .select("keyword, category_id")
        .eq("family_id", familyId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recent = useQuery({
    enabled: !!familyId,
    queryKey: ["bank_imports", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_files")
        .select("id, file_name, created_at, imported_count, row_count, status")
        .eq("family_id", familyId!)
        .eq("source", "bank_statement")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: false });
    if (json.length === 0) {
      toast.error("File is empty");
      return;
    }
    const hs = Object.keys(json[0]);
    setHeaders(hs);
    setRows(json);
    const guess = guessMapping(hs);
    const lower = hs.map((h) => h.toLowerCase());
    const findCol = (re: RegExp) => hs[lower.findIndex((l) => re.test(l))] ?? "";
    setMapping({
      date: guess.date ?? "",
      description: guess.description ?? "",
      debit: findCol(/debit|withdraw/),
      credit: findCol(/credit|deposit/),
      amount: guess.amount ?? "",
    });
    setStaged([]);
  }

  async function buildPreview() {
    if (!familyId) return;
    if (!mapping.date || !mapping.description) {
      toast.error("Map at least Date and Description.");
      return;
    }
    if (!mapping.debit && !mapping.amount) {
      toast.error("Map either a Debit column or a single Amount column.");
      return;
    }
    const rulesList = rules.data ?? [];
    const out: Staged[] = [];
    for (const r of rows) {
      const date = parseDate(r[mapping.date]);
      const description = String(r[mapping.description] ?? "").trim();
      let amount = 0;
      if (mapping.debit) {
        const d = parseAmount(r[mapping.debit]);
        if (!d) continue; // only debits (spending)
        amount = d;
      } else {
        const a = parseAmount(r[mapping.amount]);
        if (!a) continue;
        amount = a;
      }
      if (!date || !description || !amount) {
        out.push({
          raw: r, date: date ?? "", description, amount, category_id: null,
          selected: false, duplicate: false, hash: "",
          error: !date ? "Bad date" : !description ? "No description" : "No amount",
        });
        continue;
      }
      const hash = await dedupeHash(familyId, date, amount, description);
      out.push({
        raw: r,
        date,
        description,
        amount,
        category_id: autoCategoryFor(description, rulesList),
        selected: true,
        duplicate: false,
        hash,
      });
    }
    const hashes = out.map((o) => o.hash).filter(Boolean);
    if (hashes.length) {
      const { data: existing } = await supabase
        .from("expenses")
        .select("dedupe_hash")
        .eq("family_id", familyId)
        .in("dedupe_hash", hashes);
      const dupSet = new Set((existing ?? []).map((e) => e.dedupe_hash));
      for (const o of out) {
        if (o.hash && dupSet.has(o.hash)) { o.duplicate = true; o.selected = false; }
      }
    }
    setStaged(out);
    toast.success(`Parsed ${out.length} debit row(s)`);
  }

  const doImport = useMutation({
    mutationFn: async () => {
      if (!familyId || !user) throw new Error("Not ready");
      const toInsert = staged.filter((s) => s.selected && !s.error);
      if (!toInsert.length) throw new Error("Nothing selected");

      const { data: imp, error: impErr } = await supabase
        .from("import_files")
        .insert({
          family_id: familyId,
          uploaded_by: user.id,
          source: "bank_statement",
          file_name: fileName + (accountName ? ` · ${accountName}` : ""),
          row_count: staged.length,
          status: "completed",
          imported_count: toInsert.length,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      // Stage rows for audit + insert expenses
      const expensePayload = toInsert.map((r) => ({
        family_id: familyId,
        date: r.date,
        description: r.description,
        amount: r.amount,
        type: "expense" as const,
        source: "bank_statement" as const,
        category_id: r.category_id,
        comments: accountName ? `Bank: ${accountName}` : null,
        import_file_id: imp.id,
        dedupe_hash: r.hash,
        created_by: user.id,
      }));
      for (let i = 0; i < expensePayload.length; i += 200) {
        const chunk = expensePayload.slice(i, i + 200);
        const { error } = await supabase.from("expenses").insert(chunk);
        if (error) throw error;
      }

      const stagedPayload = toInsert.map((r) => ({
        family_id: familyId,
        import_file_id: imp.id,
        transaction_date: r.date,
        description: r.description,
        debit_amount: r.amount,
        amount: r.amount,
        account_name: accountName || null,
        accepted: true,
      }));
      for (let i = 0; i < stagedPayload.length; i += 200) {
        const chunk = stagedPayload.slice(i, i + 200);
        await supabase.from("bank_statement_transactions").insert(chunk);
      }
      return { count: toInsert.length };
    },
    onSuccess: ({ count }) => {
      toast.success(`Imported ${count} transaction(s)`);
      setStaged([]); setRows([]); setHeaders([]); setFileName("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["bank_imports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undo = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("expenses").delete().eq("import_file_id", id);
      await supabase.from("import_files").update({ status: "undone", imported_count: 0 }).eq("id", id);
    },
    onSuccess: () => {
      toast.success("Reverted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["bank_imports"] });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Bank Statements</h1>
        <p className="text-sm text-muted-foreground">
          Upload a downloaded bank statement (.csv/.xlsx). Only debit/spending rows are imported. Duplicates are detected by date + amount + description.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Statement file</Label>
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
          <div>
            <Label>Account name (optional)</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="HDFC Savings xx1234" />
          </div>
        </div>
        {headers.length > 0 && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <MapSelect label="Date *" value={mapping.date} headers={headers} onChange={(v) => setMapping({ ...mapping, date: v })} />
              <MapSelect label="Description *" value={mapping.description} headers={headers} onChange={(v) => setMapping({ ...mapping, description: v })} />
              <MapSelect label="Debit (spend)" value={mapping.debit} headers={headers} onChange={(v) => setMapping({ ...mapping, debit: v, amount: "" })} />
              <MapSelect label="Credit (skip)" value={mapping.credit} headers={headers} onChange={(v) => setMapping({ ...mapping, credit: v })} />
              <MapSelect label="Or single Amount" value={mapping.amount} headers={headers} onChange={(v) => setMapping({ ...mapping, amount: v, debit: "" })} />
            </div>
            <Button onClick={buildPreview}><Upload className="h-4 w-4 mr-1" /> Preview ({rows.length} rows)</Button>
          </>
        )}
      </div>

      {staged.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {staged.length} parsed · {staged.filter((s) => s.selected).length} selected · {staged.filter((s) => s.duplicate).length} duplicates
            </div>
            <Button size="sm" onClick={() => doImport.mutate()} disabled={doImport.isPending}>
              {doImport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Import selected
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {staged.map((r, i) => (
                  <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : r.duplicate ? "bg-amber-500/5" : ""}`}>
                    <td className="px-3 py-1.5">
                      <Checkbox checked={r.selected} disabled={!!r.error} onCheckedChange={(v) => setStaged((s) => s.map((x, j) => j === i ? { ...x, selected: !!v } : x))} />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</td>
                    <td className="px-3 py-1.5 max-w-[320px] truncate" title={r.description}>{r.description || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.amount, currency)}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.category_id ?? ""}
                        onChange={(e) => setStaged((s) => s.map((x, j) => j === i ? { ...x, category_id: e.target.value || null } : x))}
                        className="h-8 rounded border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="">—</option>
                        {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.error ? <span className="text-destructive">{r.error}</span>
                        : r.duplicate ? <span className="text-amber-600">Duplicate</span>
                        : <span className="text-green-600">New</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border font-medium">Recent statement imports</div>
        {(recent.data?.length ?? 0) === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">None yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">File</th><th className="px-3 py-2 text-right">Imported</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {recent.data?.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatDate(f.created_at)}</td>
                  <td className="px-3 py-2">{f.file_name}</td>
                  <td className="px-3 py-2 text-right">{f.imported_count}</td>
                  <td className="px-3 py-2 capitalize">{f.status}</td>
                  <td className="px-3 py-2 text-right">
                    {f.status === "completed" && f.imported_count > 0 && (
                      <Button size="sm" variant="outline" onClick={() => undo.mutate(f.id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Revert
                      </Button>
                    )}
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

function MapSelect({ label, value, headers, onChange }: { label: string; value: string; headers: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
        <option value="">— not mapped —</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}
