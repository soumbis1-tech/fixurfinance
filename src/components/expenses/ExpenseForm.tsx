import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { useAuth } from "@/hooks/use-auth";
import {
  useCategories,
  useMembers,
  usePaymentAccounts,
  useTrips,
} from "@/hooks/use-family-lookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import { todayISO } from "@/lib/format";
import { Loader2, Upload } from "lucide-react";

type ExpenseType = "expense" | "investment" | "reimbursement" | "income" | "transfer";

const schema = z.object({
  date: z.string().min(1, "Date required"),
  description: z.string().trim().min(1, "Description required").max(200),
  amount: z.coerce.number().positive("Amount must be > 0"),
  type: z.enum(["expense", "investment", "reimbursement", "income", "transfer"]),
  paid_by: z.string().uuid().nullable().optional(),
  category_id: z.string().nullable().optional(),
  payment_account_id: z.string().uuid().nullable().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  comments: z.string().max(1000).nullable().optional(),
  reimbursable: z.boolean(),
});

export type ExpenseFormValues = z.infer<typeof schema>;

export type ExpenseInitial = Partial<ExpenseFormValues> & {
  id?: string;
  receipt_path?: string | null;
  reimbursement_status?: "not_applicable" | "pending" | "reimbursed" | null;
};

export function ExpenseForm({
  initial,
  onSaved,
  showSaveAndAdd = true,
}: {
  initial?: ExpenseInitial;
  onSaved?: (id: string) => void;
  showSaveAndAdd?: boolean;
}) {
  const { user } = useAuth();
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const qc = useQueryClient();
  const cats = useCategories(familyId);
  const members = useMembers(familyId);
  const accounts = usePaymentAccounts(familyId);
  const trips = useTrips(familyId, true);

  const [values, setValues] = useState<ExpenseFormValues>({
    date: initial?.date ?? todayISO(),
    description: initial?.description ?? "",
    amount: initial?.amount ?? ("" as unknown as number),
    type: (initial?.type as ExpenseType) ?? "expense",
    paid_by: initial?.paid_by ?? null,
    category_id: initial?.category_id ?? null,
    payment_account_id: initial?.payment_account_id ?? null,
    trip_id: initial?.trip_id ?? null,
    comments: initial?.comments ?? "",
    reimbursable: initial?.reimbursable ?? false,
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [addAnother, setAddAnother] = useState(false);

  // Default paid_by to the current user's family_member, if available
  useEffect(() => {
    if (!initial && !values.paid_by && members.data && user) {
      const me = members.data.find((m) => m.id && (m as { user_id?: string }).user_id === user.id);
      if (me) setValues((v) => ({ ...v, paid_by: me.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.data, user]);

  const save = useMutation({
    mutationFn: async (v: ExpenseFormValues) => {
      if (!familyId) throw new Error("No active family");
      const parsed = schema.parse(v);
      let receipt_path: string | null = initial?.receipt_path ?? null;
      if (receipt) {
        const path = `${familyId}/${crypto.randomUUID()}-${receipt.name}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, receipt, { upsert: false });
        if (upErr) throw upErr;
        receipt_path = path;
      }
      const payload = {
        family_id: familyId,
        date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        type: parsed.type,
        paid_by: parsed.paid_by || null,
        category_id: parsed.category_id || null,
        payment_account_id: parsed.payment_account_id || null,
        trip_id: parsed.trip_id || null,
        comments: parsed.comments || null,
        reimbursable: parsed.reimbursable,
        reimbursement_status: (parsed.reimbursable
          ? (initial?.reimbursement_status === "reimbursed" ? "reimbursed" : "pending")
          : "not_applicable") as "not_applicable" | "pending" | "reimbursed",
        source: "manual" as const,
        receipt_path,
        created_by: user?.id ?? null,
      };
      if (initial?.id) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", initial.id);
        if (error) throw error;
        return initial.id;
      } else {
        const { data, error } = await supabase
          .from("expenses")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["monthly_summary"] });
      qc.invalidateQueries({ queryKey: ["category_summary"] });
      qc.invalidateQueries({ queryKey: ["daily_summary"] });
      qc.invalidateQueries({ queryKey: ["recent_expenses"] });
      toast.success(initial?.id ? "Expense updated" : "Expense saved");
      if (addAnother && !initial?.id) {
        setValues((v) => ({
          ...v,
          description: "",
          amount: "" as unknown as number,
          comments: "",
        }));
        setReceipt(null);
      } else {
        onSaved?.(id);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent, _addAnother: boolean) {
    e.preventDefault();
    setAddAnother(_addAnother);
    save.mutate(values);
  }

  const set = <K extends keyof ExpenseFormValues>(k: K, v: ExpenseFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  return (
    <form onSubmit={(e) => submit(e, false)} className="space-y-4 max-w-3xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date">Date *</Label>
          <Input
            id="date"
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={values.amount as unknown as string}
            onChange={(e) =>
              set("amount", (e.target.value === "" ? "" : Number(e.target.value)) as number)
            }
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description *</Label>
        <Input
          id="description"
          maxLength={200}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          required
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Select
          label="Type"
          value={values.type}
          onChange={(v) => set("type", v as ExpenseType)}
          options={[
            { value: "expense", label: "Expense" },
            { value: "investment", label: "Investment" },
            { value: "income", label: "Income" },
            { value: "reimbursement", label: "Reimbursement" },
            { value: "transfer", label: "Transfer" },
          ]}
        />
        <Select
          label="Category"
          value={values.category_id ?? ""}
          onChange={(v) => set("category_id", v || null)}
          options={[
            { value: "", label: "— None —" },
            ...(cats.data?.map((c) => ({ value: c.id, label: c.name })) ?? []),
          ]}
        />
        <Select
          label="Paid by"
          value={values.paid_by ?? ""}
          onChange={(v) => set("paid_by", v || null)}
          options={[
            { value: "", label: "— None —" },
            ...(members.data?.map((m) => ({ value: m.id, label: m.display_name })) ?? []),
          ]}
        />
        <Select
          label="Payment account"
          value={values.payment_account_id ?? ""}
          onChange={(v) => set("payment_account_id", v || null)}
          options={[
            { value: "", label: "— None —" },
            ...(accounts.data?.map((a) => ({
              value: a.id,
              label: `${a.name}${a.masked_number ? ` (${a.masked_number})` : ""}`,
            })) ?? []),
          ]}
        />
        <Select
          label="Trip (optional)"
          value={values.trip_id ?? ""}
          onChange={(v) => set("trip_id", v || null)}
          options={[
            { value: "", label: "— None —" },
            ...(trips.data?.map((t) => ({ value: t.id, label: t.name })) ?? []),
          ]}
        />
        <div className="flex items-center gap-2 pt-7">
          <Checkbox
            id="reimb"
            checked={values.reimbursable}
            onCheckedChange={(v) => set("reimbursable", !!v)}
          />
          <Label htmlFor="reimb" className="cursor-pointer">
            Reimbursable
          </Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comments">Comments</Label>
        <Textarea
          id="comments"
          rows={2}
          maxLength={1000}
          value={values.comments ?? ""}
          onChange={(e) => set("comments", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="receipt">Receipt (optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="receipt"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
          {receipt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Upload className="h-3 w-3" />
              {receipt.name}
            </span>
          )}
        </div>
        {initial?.receipt_path && !receipt && (
          <p className="text-xs text-muted-foreground">
            Current: {initial.receipt_path.split("/").pop()}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial?.id ? "Save changes" : "Save"}
        </Button>
        {showSaveAndAdd && !initial?.id && (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={(e) => submit(e, true)}
          >
            Save & add another
          </Button>
        )}
      </div>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
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
    </div>
  );
}
