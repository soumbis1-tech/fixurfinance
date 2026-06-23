import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
};

let cached: AuthState = { loading: true, session: null, user: null };
const listeners = new Set<(s: AuthState) => void>();

function set(s: AuthState) {
  cached = s;
  listeners.forEach((l) => l(s));
}

let initialized = false;
function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    set({ loading: false, session: data.session ?? null, user: data.session?.user ?? null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ loading: false, session: session ?? null, user: session?.user ?? null });
  });
}

export function useAuth(): AuthState {
  init();
  const [state, setState] = useState<AuthState>(cached);
  useEffect(() => {
    listeners.add(setState);
    setState(cached);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}
