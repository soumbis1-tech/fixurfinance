
-- Revoke default PUBLIC execute on SECURITY DEFINER functions, then grant explicitly.

-- Trigger-only / internal helpers: no direct callers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_family_defaults(uuid) FROM PUBLIC, anon, authenticated;

-- RLS helper functions: invoked inside policies; revoke direct EXECUTE from anon,
-- keep authenticated (required for RLS policy evaluation by signed-in users).
REVOKE EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_family_role(uuid, uuid, public.family_role[]) FROM PUBLIC, anon;

-- RPC functions used by signed-in users only
REVOKE EXECUTE ON FUNCTION public.create_family(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_family_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_family_sample_data(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.category_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.member_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.monthly_summary(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.daily_summary(uuid, date, date) FROM PUBLIC, anon;

-- invitation_preview is intentionally callable pre-login (accept-invite page).
-- Keep anon EXECUTE; just strip PUBLIC default to make grants explicit.
REVOKE EXECUTE ON FUNCTION public.invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;
