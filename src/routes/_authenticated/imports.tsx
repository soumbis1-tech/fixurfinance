import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useAuth } from "@/hooks/use-auth";
import { useCategories, useMembers, useTrips } from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  FileText,
  Undo2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  ParsedRow,
  RawRow,
  autoCategoryFor,
  dedupeHash,
  guessMapping,
  parseAmount,
  parseDate,
  parseText,
} from "@/lib/import-utils";

export const Route = createFileRoute("/_authenticated/imports")({
  head: () => ({ meta: [{ title: "Imports" }] }),
  component: ImportsPage,
});

type Mapping = {
  date: string;
  description: string;
  amount: string;
  paid_by: string;
  category: string;
  comments: string;
  reimbursable: string;
  trip: string;
};
const EMPTY_MAPPING: Mapping = {
  date: "",
  description: "",
  amount: "",
  paid_by: "",
  category: "",
  comments: "",
  reimbursable: "",
  trip: "",
};

type StagedRow = ParsedRow & {
  selected: boolean;
  category_id: string | null;
  paid_by_id: string | null;
  trip_id: string | null;
  reimbursable: boolean;
  hash: string;
  duplicate: boolean;
  error?: string | null;
};

function parseBoolish(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return ["y", "yes", "true", "1", "reimbursable", "reimburse", "r"].includes(s);
}

function ImportsPage() {
  const { activeFamily } = useActiveFamily();
  const { user } = useAuth();
  const familyId = activeFamily?.id;
  const currency = activeFamily?.currency ?? "INR";
  const qc = useQueryClient();

  const cats = useCategories(familyId);
  const members = useMembers(familyId);
  const trips = useTrips(familyId);

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [defaultPaidById, setDefaultPaidById] = useState<string>("");
  const [defaultTripId, setDefaultTripId] = useState<string>("");
  const [defaultReimbursable, setDefaultReimbursable] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState("");
  const [source, setSource] = useState<"excel_import" | "text_import">("excel_import");
  const [staged, setStaged] = useState<StagedRow[]>([]);
  const [building, setBuilding] = useState(false);

  // Fetch rules for auto-categorization
  const rulesQ = useQuery({
    enabled: !!familyId,
    queryKey: ["category_rules", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_rules")
        .select("keyword, category_id")
        .eq("family_id", familyId!)
        .order("priority");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent imports list (for undo)
  const recentQ = useQuery({
    enabled: !!familyId,
    queryKey: ["import_files", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_files")
        .select("id, file_name, source, row_count, imported_count, status, created_at")
        .eq("family_id", familyId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  function resetStaging() {
    setStaged([]);
  }

  async function handleFile(file: File) {
    resetStaging();
    setFileName(file.name);
    setSource("excel_import");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    setWorkbook(wb);
    setSheetNames(wb.SheetNames);
    setActiveSheet(wb.SheetNames[0] ?? "");
  }

  useEffect(() => {
    if (!workbook || !activeSheet) return;
    const ws = workbook.Sheets[activeSheet];
    const json = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: false });
    if (json.length === 0) {
      setHeaders([]);
      setRawRows([]);
      return;
    }
    const hs = Object.keys(json[0]);
    setHeaders(hs);
    setRawRows(json);
    setMapping({ ...EMPTY_MAPPING, ...guessMapping(hs) } as Mapping);
  }, [workbook, activeSheet]);

  function handlePasteParse() {
    resetStaging();
    setFileName("Pasted text");
    setSource("text_import");
    const { headers: hs, rows } = parseText(pastedText);
    setHeaders(hs);
    setRawRows(rows);
    setMapping({ ...EMPTY_MAPPING, ...guessMapping(hs) } as Mapping);
    setWorkbook(null);
    setSheetNames([]);
    setActiveSheet("");
  }

  async function buildPreview() {
    if (!familyId) return;
    if (!mapping.date || !mapping.description || !mapping.amount) {
      toast.error("Map at least Date, Description and Amount columns.");
      return;
    }
    setBuilding(true);
    try {
      const memberByName = new Map(
        (members.data ?? []).map((m) => [m.display_name.trim().toLowerCase(), m.id]),
      );
      const catByName = new Map(
        (cats.data ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
      );
      const rules = rulesQ.data ?? [];

      const parsed: StagedRow[] = [];
      for (const r of rawRows) {
        const dRaw = r[mapping.date];
        const descRaw = r[mapping.description];
        const amtRaw = r[mapping.amount];
        const date = parseDate(dRaw);
        const amount = parseAmount(amtRaw);
        const description = String(descRaw ?? "").trim();
        if (!date || !amount || !description) {
          parsed.push({
            date: date ?? "",
            description,
            amount: amount ?? 0,
            selected: false,
            category_id: null,
            paid_by_id: null,
            trip_id: null,
            reimbursable: false,
            hash: "",
            duplicate: false,
            error: !date ? "Bad date" : !amount ? "Bad amount" : "Missing description",
          });
          continue;
        }
        const paidByName = mapping.paid_by ? String(r[mapping.paid_by] ?? "").trim() : "";
        const catName = mapping.category ? String(r[mapping.category] ?? "").trim() : "";
        const comments = mapping.comments ? String(r[mapping.comments] ?? "").trim() : "";
        const tripName = mapping.trip ? String(r[mapping.trip] ?? "").trim() : "";
        const reimbRaw = mapping.reimbursable ? r[mapping.reimbursable] : undefined;

        const paid_by_id =
          (paidByName && memberByName.get(paidByName.toLowerCase())) ||
          defaultPaidById ||
          null;
        const category_id =
          (catName && catByName.get(catName.toLowerCase())) ||
          autoCategoryFor(description, rules) ||
          defaultCategoryId ||
          null;
        const tripByName = new Map(
          (trips.data ?? []).map((t) => [t.name.trim().toLowerCase(), t.id]),
        );
        const trip_id =
          (tripName && tripByName.get(tripName.toLowerCase())) || defaultTripId || null;
        const reimbursable = mapping.reimbursable ? parseBoolish(reimbRaw) : defaultReimbursable;

        const hash = await dedupeHash(familyId, date, amount, description);
        parsed.push({
          date,
          description,
          amount,
          comments: comments || null,
          selected: true,
          category_id,
          paid_by_id,
          trip_id,
          reimbursable,
          hash,
          duplicate: false,
        });
      }

      // Check for duplicates in DB
      const hashes = parsed.map((p) => p.hash).filter(Boolean);
      if (hashes.length > 0) {
        const { data: existing, error } = await supabase
          .from("expenses")
          .select("dedupe_hash")
          .eq("family_id", familyId)
          .in("dedupe_hash", hashes);
        if (error) throw error;
        const dupSet = new Set((existing ?? []).map((e) => e.dedupe_hash));
        for (const p of parsed) {
          if (p.hash && dupSet.has(p.hash)) {
            p.duplicate = true;
            p.selected = false;
          }
        }
      }
      setStaged(parsed);
      toast.success(`Parsed ${parsed.length} row(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  const counts = useMemo(() => {
    const total = staged.length;
    const selected = staged.filter((s) => s.selected).length;
    const dup = staged.filter((s) => s.duplicate).length;
    const err = staged.filter((s) => s.error).length;
    return { total, selected, dup, err };
  }, [staged]);

  const doImport = useMutation({
    mutationFn: async () => {
      if (!familyId || !user) throw new Error("No family or user");
      const toInsert = staged.filter((s) => s.selected && !s.error);
      if (toInsert.length === 0) throw new Error("Nothing selected to import");

      const { data: imp, error: impErr } = await supabase
        .from("import_files")
        .insert({
          family_id: familyId,
          uploaded_by: user.id,
          source,
          file_name: fileName,
          row_count: staged.length,
          status: "completed",
          imported_count: toInsert.length,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const rows = toInsert.map((r) => ({
        family_id: familyId,
        date: r.date,
        description: r.description,
        amount: r.amount,
        category_id: r.category_id,
        paid_by: r.paid_by_id,
        trip_id: r.trip_id,
        reimbursable: r.reimbursable,
        reimbursement_status: r.reimbursable ? ("pending" as const) : null,
        comments: r.comments ?? null,
        type: "expense" as const,
        source,
        import_file_id: imp.id,
        dedupe_hash: r.hash,
        created_by: user.id,
      }));

      // Insert in chunks to keep payloads small
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from("expenses").insert(chunk);
        if (error) throw error;
      }
      return { count: toInsert.length };
    },
    onSuccess: ({ count }) => {
      toast.success(`Imported ${count} expense(s)`);
      setStaged([]);
      setRawRows([]);
      setHeaders([]);
      setFileName("");
      setPastedText("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["import_files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoImport = useMutation({
    mutationFn: async (id: string) => {
      const { error: delErr } = await supabase.from("expenses").delete().eq("import_file_id", id);
      if (delErr) throw delErr;
      const { error: updErr } = await supabase
        .from("import_files")
        .update({ status: "undone", imported_count: 0 })
        .eq("id", id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Import undone");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["import_files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Imports</h1>
        <p className="text-sm text-muted-foreground">
          Upload Excel/CSV or paste rows. Map columns, preview, then import. Duplicates (same date, amount, description) are detected automatically.
        </p>
      </div>

      {/* Upload / paste */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="h-4 w-4" /> Excel / CSV file
          </div>
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {sheetNames.length > 1 && (
            <div>
              <Label className="text-xs">Sheet</Label>
              <Select value={activeSheet} onChange={(v) => setActiveSheet(v)}
                options={sheetNames.map((s) => ({ value: s, label: s }))} />
            </div>
          )}
          {fileName && <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4" /> Paste plain text (TSV/CSV)
          </div>
          <Textarea
            rows={5}
            placeholder={"date\tdescription\tamount\n2026-06-01\tBlinkit groceries\t450"}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={handlePasteParse} disabled={!pastedText.trim()}>
            Parse text
          </Button>
        </div>
      </div>

      {/* Mapping */}
      {headers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-medium">Column mapping</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MapSelect label="Date *" value={mapping.date} headers={headers}
              onChange={(v) => setMapping({ ...mapping, date: v })} />
            <MapSelect label="Description *" value={mapping.description} headers={headers}
              onChange={(v) => setMapping({ ...mapping, description: v })} />
            <MapSelect label="Amount *" value={mapping.amount} headers={headers}
              onChange={(v) => setMapping({ ...mapping, amount: v })} />
            <MapSelect label="Paid by" value={mapping.paid_by} headers={headers}
              onChange={(v) => setMapping({ ...mapping, paid_by: v })} />
            <MapSelect label="Category" value={mapping.category} headers={headers}
              onChange={(v) => setMapping({ ...mapping, category: v })} />
            <MapSelect label="Comments" value={mapping.comments} headers={headers}
              onChange={(v) => setMapping({ ...mapping, comments: v })} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Default category (fallback)</Label>
              <Select value={defaultCategoryId} onChange={setDefaultCategoryId}
                options={[{ value: "", label: "— none —" }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div>
              <Label className="text-xs">Default paid-by (fallback)</Label>
              <Select value={defaultPaidById} onChange={setDefaultPaidById}
                options={[{ value: "", label: "— none —" }, ...(members.data ?? []).map((m) => ({ value: m.id, label: m.display_name }))]} />
            </div>
          </div>

          <Button onClick={buildPreview} disabled={building}>
            {building ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Build preview ({rawRows.length} rows)
          </Button>
        </div>
      )}

      {/* Preview */}
      {staged.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b border-border">
            <div className="text-sm text-muted-foreground">
              {counts.total} parsed · {counts.selected} selected · {counts.dup} duplicate(s) · {counts.err} error(s)
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setStaged((s) => s.map((r) => ({ ...r, selected: !r.error && !r.duplicate })))}>
                Select all (non-dup)
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStaged((s) => s.map((r) => ({ ...r, selected: false })))}>
                Clear
              </Button>
              <Button size="sm" onClick={() => doImport.mutate()} disabled={doImport.isPending || counts.selected === 0}>
                {doImport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Import {counts.selected}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Paid by</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {staged.map((r, i) => (
                  <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : r.duplicate ? "bg-amber-500/5" : ""}`}>
                    <td className="px-3 py-1.5">
                      <Checkbox
                        checked={r.selected}
                        disabled={!!r.error}
                        onCheckedChange={(v) =>
                          setStaged((s) => s.map((x, j) => (j === i ? { ...x, selected: !!v } : x)))
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</td>
                    <td className="px-3 py-1.5 max-w-[280px] truncate" title={r.description}>{r.description || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.amount ? formatMoney(r.amount, currency) : "—"}</td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={r.category_id ?? ""}
                        onChange={(v) =>
                          setStaged((s) => s.map((x, j) => (j === i ? { ...x, category_id: v || null } : x)))
                        }
                        options={[{ value: "", label: "—" }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        value={r.paid_by_id ?? ""}
                        onChange={(v) =>
                          setStaged((s) => s.map((x, j) => (j === i ? { ...x, paid_by_id: v || null } : x)))
                        }
                        options={[{ value: "", label: "—" }, ...(members.data ?? []).map((m) => ({ value: m.id, label: m.display_name }))]}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.error ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {r.error}
                        </span>
                      ) : r.duplicate ? (
                        <span className="text-amber-600">Duplicate</span>
                      ) : (
                        <span className="text-green-600">New</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent imports */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border font-medium">Recent imports</div>
        {recentQ.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
        ) : (recentQ.data?.length ?? 0) === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No imports yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium text-right">Imported</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentQ.data?.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(f.created_at)}</td>
                  <td className="px-3 py-2">{f.file_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.source}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.imported_count}</td>
                  <td className="px-3 py-2 capitalize">{f.status}</td>
                  <td className="px-3 py-2 text-right">
                    {f.status === "completed" && f.imported_count > 0 ? (
                      <Button size="sm" variant="outline" onClick={() => undoImport.mutate(f.id)} disabled={undoImport.isPending}>
                        <Undo2 className="h-4 w-4 mr-1" /> Undo
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
      <Select
        value={value}
        onChange={onChange}
        options={[{ value: "", label: "— not mapped —" }, ...headers.map((h) => ({ value: h, label: h }))]}
      />
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
