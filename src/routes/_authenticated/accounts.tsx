import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveFamily } from "@/hooks/use-families";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, CreditCard, Landmark } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Payment Accounts" }] }),
  component: AccountsPage,
});

type AccountType = "bank" | "credit_card";
type Row = {
  id: string;
  name: string;
  type: AccountType;
  masked_number: string | null;
  beneficiary_name: string | null;
  active: boolean;
};

const schema = z.object({
  beneficiary_name: z.string().trim().min(1, "Beneficiary name required").max(120),
  name: z.string().trim().min(1, "Bank / card name required").max(120),
  masked_number: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter exactly 4 digits"),
  type: z.enum(["bank", "credit_card"]),
});

function AccountsPage() {
  const { activeFamily } = useActiveFamily();
  const familyId = activeFamily?.id;
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const list = useQuery({
    enabled: !!familyId,
    queryKey: ["payment_accounts_all", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_accounts")
        .select("id, name, type, masked_number, beneficiary_name, active")
        .eq("family_id", familyId!)
        .order("type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_accounts_all"] });
      qc.invalidateQueries({ queryKey: ["payment_accounts"] });
      toast.success("Account deleted");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const banks = (list.data ?? []).filter((r) => r.type === "bank");
  const cards = (list.data ?? []).filter((r) => r.type === "credit_card");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Payment Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Add your bank accounts and credit cards. They appear in the Payment account
            dropdown when adding an expense.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Add account
        </Button>
      </div>

      {showForm && (
        <AccountForm
          familyId={familyId!}
          initial={editing}
          onDone={() => {
            setShowForm(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["payment_accounts_all"] });
            qc.invalidateQueries({ queryKey: ["payment_accounts"] });
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {list.isLoading ? (
        <div className="flex items-center text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <AccountSection
            title="Bank Accounts"
            icon={<Landmark className="h-4 w-4" />}
            rows={banks}
            onEdit={(r) => {
              setEditing(r);
              setShowForm(true);
            }}
            onDelete={setDeleteId}
          />
          <AccountSection
            title="Credit Cards"
            icon={<CreditCard className="h-4 w-4" />}
            rows={cards}
            onEdit={(r) => {
              setEditing(r);
              setShowForm(true);
            }}
            onDelete={setDeleteId}
          />
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This won't remove existing expenses linked to it, but you won't be able to
              select it for new expenses.
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

function AccountSection({
  title,
  icon,
  rows,
  onEdit,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
  onEdit: (r: Row) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        {icon}
        <h2 className="font-medium">{title}</h2>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">None added yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.name}
                  {r.masked_number && (
                    <span className="text-muted-foreground"> •••• {r.masked_number}</span>
                  )}
                </div>
                {r.beneficiary_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {r.beneficiary_name}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" title="Edit" onClick={() => onEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Delete"
                  onClick={() => onDelete(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountForm({
  familyId,
  initial,
  onDone,
  onCancel,
}: {
  familyId: string;
  initial: Row | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<AccountType>(initial?.type ?? "bank");
  const [beneficiary, setBeneficiary] = useState(initial?.beneficiary_name ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [last4, setLast4] = useState(initial?.masked_number ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        type,
        beneficiary_name: beneficiary,
        name,
        masked_number: last4,
      });
      const payload = {
        family_id: familyId,
        type: parsed.type,
        beneficiary_name: parsed.beneficiary_name,
        name: parsed.name,
        masked_number: parsed.masked_number,
        active: true,
      };
      if (initial?.id) {
        const { error } = await supabase
          .from("payment_accounts")
          .update(payload)
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial?.id ? "Account updated" : "Account added");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <h2 className="font-medium">{initial?.id ? "Edit account" : "New account"}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Account type *</Label>
          <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
            <SelectTrigger className="bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-transparent">
              <SelectItem value="bank">Bank Account</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="beneficiary">Account Beneficiary Name *</Label>
          <Input
            id="beneficiary"
            maxLength={120}
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bank">{type === "credit_card" ? "Card / Bank Name *" : "Bank Name *"}</Label>
          <Input
            id="bank"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last4">Last 4 digits *</Label>
          <Input
            id="last4"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial?.id ? "Save changes" : "Add account"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
