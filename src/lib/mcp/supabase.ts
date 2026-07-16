import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

/** Build a Supabase client that runs as the OAuth-authenticated user (RLS applies). */
export function supabaseForUser(ctx: ToolContext): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Pick the user's default family, or first membership if none set. */
export async function resolveFamilyId(
  sb: SupabaseClient<Database>,
  userId: string,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const { data: prof } = await sb
    .from("profiles")
    .select("default_family_id")
    .eq("id", userId)
    .maybeSingle();
  if (prof?.default_family_id) return prof.default_family_id;
  const { data: role } = await sb
    .from("family_user_roles")
    .select("family_id")
    .limit(1)
    .maybeSingle();
  if (!role?.family_id) throw new Error("You are not a member of any family yet.");
  return role.family_id;
}

export function textResult(text: string, structured?: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured !== undefined ? { structuredContent: { data: structured } } : {}),
  };
}

export function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
