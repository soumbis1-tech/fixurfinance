import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

const ACTIVE_KEY = "fet-active-family";

export function useFamilies() {
  const { user, loading } = useAuth();
  return useQuery({
    enabled: !!user && !loading,
    queryKey: ["families", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_user_roles")
        .select("role, family:families(id, name, currency, date_format, timezone)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        role: r.role as "owner" | "admin" | "member" | "viewer",
        family: r.family as {
          id: string;
          name: string;
          currency: string;
          date_format: string;
          timezone: string;
        },
      }));
    },
  });
}

export function useActiveFamily() {
  const { data: families, isLoading } = useFamilies();
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(ACTIVE_KEY),
  );

  // If no active family stored, fall back to first available
  useEffect(() => {
    if (!families || families.length === 0) return;
    if (!activeId || !families.some((f) => f.family.id === activeId)) {
      const next = families[0].family.id;
      setActiveIdState(next);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, next);
    }
  }, [families, activeId]);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, id);
  };

  const active = families?.find((f) => f.family.id === activeId) ?? null;
  return {
    isLoading,
    families: families ?? [],
    activeFamily: active?.family ?? null,
    activeRole: active?.role ?? null,
    activeFamilyId: activeId,
    setActiveFamilyId: setActiveId,
    hasFamily: (families?.length ?? 0) > 0,
  };
}
