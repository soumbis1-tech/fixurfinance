-- Expenses: require ownership AND active family membership for UPDATE/DELETE
DROP POLICY IF EXISTS "exp update own" ON public.expenses;
DROP POLICY IF EXISTS "exp delete own" ON public.expenses;

CREATE POLICY "exp update own" ON public.expenses
FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND public.is_family_member(family_id, auth.uid()))
WITH CHECK (created_by = auth.uid() AND public.is_family_member(family_id, auth.uid()));

CREATE POLICY "exp delete own" ON public.expenses
FOR DELETE TO authenticated
USING (created_by = auth.uid() AND public.is_family_member(family_id, auth.uid()));

-- family_user_roles: tighten bootstrap insert to require caller = families.created_by
DROP POLICY IF EXISTS "fur add" ON public.family_user_roles;

CREATE POLICY "fur add" ON public.family_user_roles
FOR INSERT TO authenticated
WITH CHECK (
  public.has_family_role(family_id, auth.uid(), ARRAY['owner'::family_role, 'admin'::family_role])
  OR (
    NOT EXISTS (SELECT 1 FROM public.family_user_roles fur2 WHERE fur2.family_id = family_user_roles.family_id)
    AND user_id = auth.uid()
    AND role = 'owner'::family_role
    AND EXISTS (SELECT 1 FROM public.families f WHERE f.id = family_user_roles.family_id AND f.created_by = auth.uid())
  )
);