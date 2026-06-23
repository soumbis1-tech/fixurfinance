
REVOKE EXECUTE ON FUNCTION public.is_family_member(UUID,UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_family_role(UUID,UUID,public.family_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_family_defaults(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_family(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.monthly_summary(UUID,INT,INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.category_summary(UUID,DATE,DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.member_summary(UUID,DATE,DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.daily_summary(UUID,DATE,DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_family_member(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_family_role(UUID,UUID,public.family_role[]) TO authenticated;
