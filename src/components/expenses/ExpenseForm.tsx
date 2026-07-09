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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { todayISO } from "@/lib/format";
import { Loader2, Upload, Plus } from "lucide-react";

type ExpenseType = "expense" | "investment" | "reimbursement" | "income" | "transfer";

const ADD_NEW = "__add_new__";

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

type QuickAddKind = "category" | "member" | "account" | "trip" | null;

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
  const [quickAdd, setQuickAdd] = useState<QuickAddKind>(null);

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
      if (!v.type) throw new Error("Type is required");
      if (!v.category_id) throw new Error("Category is required");
      if (!v.paid_by) throw new Error("Paid by is required");
      if (!v.payment_account_id) throw new Error("Payment account is required");

      const parsed = schema.parse(v);

      let category_id: string | null = parsed.category_id || null;
      if (category_id === "__other__") {
        const { data: existing } = await supabase
          .from("categories")
          .select("id")
          .eq("family_id", familyId)
          .ilike("name", "Other")
          .maybeSingle();
        if (existing?.id) {
          category_id = existing.id;
        } else {
          const { data: created, error: cErr } = await supabase
            .from("categories")
            .insert({ family_id: familyId, name: "Other" })
            .select("id")
            .single();
          if (cErr) throw cErr;
          category_id = created.id;
        }
      }

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
        category_id,
        payment_account_id: parsed.payment_account_id || null,
        trip_id: parsed.trip_id || null,
        comments: parsed.comments || null,
        reimbursable: parsed.reimbursable,
        reimbursement_status: (parsed.reimbursable
          ? (initial?.reimbursement_status === "reimbursed" ? "reimbursed" : "pending")
          : "not_applicable") as "not_applicable" | "pending" | "reimbursed",
        source: "manual" as const,
        receipt_path,
        created_by: user!.id,
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

  function handleSelect(field: keyof ExpenseFormValues, kind: Exclude<QuickAddKind, null>, v: string) {
    if (v === "__none__") {
      set(field, null as never);
      return;
    }
    if (v === ADD_NEW) {
      setQuickAdd(kind);
      return;
    }
    set(field, (v || null) as never);
  }

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

      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        In case of personal expense, please mention <strong>"Personal Expense"</strong> in the Comments section.
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <SmartSelect
          label="Type *"
          value={values.type}
          onChange={(v) => set("type", v as ExpenseType)}
          options={[
            { value: "expense", label: "Expense" },
            { value: "investment", label: "Investment" },
            { value: "income", label: "Income" },
            { value: "reimbursement", label: "Reimbursement" },
            { value: "transfer", label: "Transfer" },
          ]}
          placeholder="Select"
        />
        <SmartSelect
          label="Category *"
          value={values.category_id ?? ""}
          onChange={(v) => handleSelect("category_id", "category", v)}
          options={[
            ...(cats.data?.map((c) => ({ value: c.id, label: c.name })) ?? []),
            { value: "__other__", label: "Other" },
          ]}
          addNewLabel="+ Add new category…"
          placeholder="Select category"
        />
        <SmartSelect
          label="Paid by *"
          value={values.paid_by ?? ""}
          onChange={(v) => handleSelect("paid_by", "member", v)}
          options={members.data?.map((m) => ({ value: m.id, label: m.display_name })) ?? []}
          addNewLabel="+ Add new member…"
          placeholder="Select member"
        />
        <SmartSelect
          label="Payment account *"
          value={values.payment_account_id ?? ""}
          onChange={(v) => handleSelect("payment_account_id", "account", v)}
          options={
            accounts.data?.map((a) => ({
              value: a.id,
              label: `${a.name}${a.masked_number ? ` (${a.masked_number})` : ""}`,
            })) ?? []
          }
          addNewLabel="+ Add new account…"
          placeholder="Select account"
        />
        <SmartSelect
          label="Trip (optional)"
          value={values.trip_id ?? ""}
          onChange={(v) => handleSelect("trip_id", "trip", v)}
          options={trips.data?.map((t) => ({ value: t.id, label: t.name })) ?? []}
          addNewLabel="+ Add new trip…"
          placeholder="— None —"
          allowNone
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

      {familyId && (
        <QuickAddDialog
          kind={quickAdd}
          familyId={familyId}
          onClose={() => setQuickAdd(null)}
          onCreated={(kind, id) => {
            setQuickAdd(null);
            if (kind === "category") set("category_id", id);
            if (kind === "member") set("paid_by", id);
            if (kind === "account") set("payment_account_id", id);
            if (kind === "trip") set("trip_id", id);
          }}
        />
      )}
    </form>
  );
}

function SmartSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  addNewLabel,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  addNewLabel?: string;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <UiSelect value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="bg-transparent">
          <SelectValue placeholder={placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none__" onSelect={() => onChange("")}>— None —</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          {addNewLabel && (
            <SelectItem value={ADD_NEW} className="text-primary font-medium">
              {addNewLabel}
            </SelectItem>
          )}
        </SelectContent>
      </UiSelect>
    </div>
  );
}

function QuickAddDialog({
  kind,
  familyId,
  onClose,
  onCreated,
}: {
  kind: QuickAddKind;
  familyId: string;
  onClose: () => void;
  onCreated: (kind: Exclude<QuickAddKind, null>, id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [last4, setLast4] = useState("");
  const [accountType, setAccountType] = useState<"bank" | "credit_card">("bank");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    if (kind) {
      setName("");
      setBeneficiary("");
      setLast4("");
      setAccountType("bank");
      setStartDate(todayISO());
      setEndDate("");
    }
  }, [kind]);

  const create = useMutation({
    mutationFn: async () => {
      if (!kind) throw new Error("No kind");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");

      if (kind === "category") {
        const { data, error } = await supabase
          .from("categories")
          .insert({ family_id: familyId, name: trimmed })
          .select("id")
          .single();
        if (error) throw error;
        return { kind, id: data.id as string };
      }
      if (kind === "member") {
        const { data, error } = await supabase
          .from("family_members")
          .insert({ family_id: familyId, display_name: trimmed, active: true })
          .select("id")
          .single();
        if (error) throw error;
        return { kind, id: data.id as string };
      }
      if (kind === "account") {
        if (!beneficiary.trim()) throw new Error("Beneficiary name is required");
        if (!/^\d{4}$/.test(last4)) throw new Error("Enter exactly 4 digits");
        const { data, error } = await supabase
          .from("payment_accounts")
          .insert({
            family_id: familyId,
            name: trimmed,
            type: accountType,
            beneficiary_name: beneficiary.trim(),
            masked_number: last4,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { kind, id: data.id as string };
      }
      if (kind === "trip") {
        if (!startDate) throw new Error("Start date is required");
        const { data, error } = await supabase
          .from("trips")
          .insert({
            family_id: familyId,
            name: trimmed,
            start_date: startDate,
            end_date: endDate || null,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { kind, id: data.id as string };
      }
      throw new Error("Unknown kind");
    },
    onSuccess: ({ kind, id }) => {
      const invalidations: Record<Exclude<QuickAddKind, null>, string> = {
        category: "categories",
        member: "members",
        account: "payment_accounts",
        trip: "trips",
      };
      qc.invalidateQueries({ queryKey: [invalidations[kind]] });
      if (kind === "account") qc.invalidateQueries({ queryKey: ["payment_accounts_all"] });
      toast.success("Added");
      onCreated(kind, id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const titles: Record<Exclude<QuickAddKind, null>, string> = {
    category: "Add Category",
    member: "Add Member",
    account: "Add Payment Account",
    trip: "Add Trip",
  };

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind ? titles[kind] : ""}</DialogTitle>
          <DialogDescription>
            Create a new entry — it will be selected automatically.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-3"
        >
          {kind === "account" && (
            <div className="space-y-1.5">
              <Label>Account type *</Label>
              <UiSelect value={accountType} onValueChange={(v) => setAccountType(v as "bank" | "credit_card")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Account</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </UiSelect>
            </div>
          )}

          {kind === "account" && (
            <div className="space-y-1.5">
              <Label htmlFor="qa-benef">Beneficiary Name *</Label>
              <Input id="qa-benef" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} maxLength={120} required />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="qa-name">
              {kind === "account" ? "Bank / Card Name *" : "Name *"}
            </Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              required
            />
          </div>

          {kind === "account" && (
            <div className="space-y-1.5">
              <Label htmlFor="qa-last4">Last 4 digits *</Label>
              <Input
                id="qa-last4"
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
              />
            </div>
          )}

          {kind === "trip" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qa-start">Start date *</Label>
                <Input id="qa-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-end">End date</Label>
                <Input id="qa-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
