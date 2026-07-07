import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCategories(familyId: string | null | undefined) {
  return useQuery({
    enabled: !!familyId,
    queryKey: ["categories", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, icon, color, sort_order")
        .eq("family_id", familyId!)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMembers(familyId: string | null | undefined) {
  return useQuery({
    enabled: !!familyId,
    queryKey: ["members", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_members")
        .select("id, display_name, color, active")
        .eq("family_id", familyId!)
        .eq("active", true)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePaymentAccounts(familyId: string | null | undefined) {
  return useQuery({
    enabled: !!familyId,
    queryKey: ["payment_accounts", familyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_accounts")
        .select("id, name, type, masked_number, beneficiary_name, active")
        .eq("family_id", familyId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTrips(familyId: string | null | undefined, onlyActive = false) {
  return useQuery({
    enabled: !!familyId,
    queryKey: ["trips", familyId, onlyActive],
    queryFn: async () => {
      let q = supabase
        .from("trips")
        .select("id, name, start_date, end_date, active, notes")
        .eq("family_id", familyId!);
      if (onlyActive) q = q.eq("active", true);
      const { data, error } = await q.order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
