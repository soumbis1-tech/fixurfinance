-- Guardrail: only the creator can UPDATE or DELETE an expense.
-- Keep INSERT open to any family member with write role; SELECT unchanged.

DROP POLICY IF EXISTS "exp write" ON public.expenses;

CREATE POLICY "exp insert"
  ON public.expenses FOR INSERT
  WITH CHECK (
    public.has_family_role(family_id, auth.uid(), ARRAY['owner'::family_role,'admin'::family_role,'member'::family_role])
    AND created_by = auth.uid()
  );

CREATE POLICY "exp update own"
  ON public.expenses FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "exp delete own"
  ON public.expenses FOR DELETE
  USING (created_by = auth.uid());
