-- Restrict expenses write policies to authenticated role and enforce non-null created_by
UPDATE public.expenses SET created_by = (SELECT created_by FROM public.families WHERE id = expenses.family_id) WHERE created_by IS NULL;

ALTER TABLE public.expenses ALTER COLUMN created_by SET NOT NULL;

DROP POLICY IF EXISTS "exp insert" ON public.expenses;
DROP POLICY IF EXISTS "exp update own" ON public.expenses;
DROP POLICY IF EXISTS "exp delete own" ON public.expenses;

CREATE POLICY "exp insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_family_member(family_id, auth.uid()));

CREATE POLICY "exp update own" ON public.expenses
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "exp delete own" ON public.expenses
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());