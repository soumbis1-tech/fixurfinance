
-- Settlement tracking tables
CREATE TABLE public.expense_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES auth.users(id),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  totals JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX ON public.expense_settlements(family_id, status);
CREATE INDEX ON public.expense_settlements(family_id, completed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_settlements TO authenticated;
GRANT ALL ON public.expense_settlements TO service_role;
ALTER TABLE public.expense_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view family settlements"
  ON public.expense_settlements FOR SELECT TO authenticated
  USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Members can create settlements"
  ON public.expense_settlements FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(family_id, auth.uid()) AND initiated_by = auth.uid());
CREATE POLICY "Members can update pending settlements"
  ON public.expense_settlements FOR UPDATE TO authenticated
  USING (public.is_family_member(family_id, auth.uid()))
  WITH CHECK (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Initiator can delete pending settlement"
  ON public.expense_settlements FOR DELETE TO authenticated
  USING (public.is_family_member(family_id, auth.uid()) AND initiated_by = auth.uid() AND status = 'pending');

CREATE TRIGGER expense_settlements_updated_at BEFORE UPDATE ON public.expense_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.expense_settlement_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id UUID NOT NULL REFERENCES public.expense_settlements(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, user_id)
);
CREATE INDEX ON public.expense_settlement_approvals(settlement_id);

GRANT SELECT, INSERT, DELETE ON public.expense_settlement_approvals TO authenticated;
GRANT ALL ON public.expense_settlement_approvals TO service_role;
ALTER TABLE public.expense_settlement_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view family approvals"
  ON public.expense_settlement_approvals FOR SELECT TO authenticated
  USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Members approve for themselves"
  ON public.expense_settlement_approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(family_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "Members revoke own approval"
  ON public.expense_settlement_approvals FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RPC: start a new settlement (or return existing pending one)
CREATE OR REPLACE FUNCTION public.start_expense_settlement(_family_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing UUID;
  _new_id UUID;
  _last_completed TIMESTAMP WITH TIME ZONE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_family_member(_family_id, _uid) THEN RAISE EXCEPTION 'Not a family member'; END IF;

  SELECT id INTO _existing FROM public.expense_settlements
    WHERE family_id = _family_id AND status = 'pending' LIMIT 1;
  IF _existing IS NOT NULL THEN
    INSERT INTO public.expense_settlement_approvals(settlement_id, family_id, user_id)
      VALUES (_existing, _family_id, _uid) ON CONFLICT DO NOTHING;
    RETURN _existing;
  END IF;

  SELECT COALESCE(MAX(completed_at), (SELECT created_at FROM public.families WHERE id = _family_id))
    INTO _last_completed FROM public.expense_settlements
    WHERE family_id = _family_id AND status = 'completed';

  INSERT INTO public.expense_settlements(family_id, initiated_by, period_start, period_end, status)
    VALUES (_family_id, _uid, _last_completed, now(), 'pending')
    RETURNING id INTO _new_id;

  INSERT INTO public.expense_settlement_approvals(settlement_id, family_id, user_id)
    VALUES (_new_id, _family_id, _uid);

  RETURN _new_id;
END; $$;

-- RPC: approve current pending settlement; complete it when everyone approved
CREATE OR REPLACE FUNCTION public.approve_expense_settlement(_settlement_id UUID)
RETURNS TABLE(status TEXT, approvals_count INT, required_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _s RECORD;
  _required INT;
  _approvals INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _s FROM public.expense_settlements WHERE id = _settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF NOT public.is_family_member(_s.family_id, _uid) THEN RAISE EXCEPTION 'Not a family member'; END IF;
  IF _s.status <> 'pending' THEN RAISE EXCEPTION 'Settlement already %', _s.status; END IF;

  INSERT INTO public.expense_settlement_approvals(settlement_id, family_id, user_id)
    VALUES (_settlement_id, _s.family_id, _uid) ON CONFLICT DO NOTHING;

  SELECT COUNT(DISTINCT user_id)::INT INTO _required FROM public.family_user_roles WHERE family_id = _s.family_id;
  SELECT COUNT(*)::INT INTO _approvals FROM public.expense_settlement_approvals WHERE settlement_id = _settlement_id;

  IF _approvals >= _required THEN
    UPDATE public.expense_settlements
      SET status = 'completed', completed_at = now(), period_end = now()
      WHERE id = _settlement_id;
    RETURN QUERY SELECT 'completed'::TEXT, _approvals, _required;
  ELSE
    RETURN QUERY SELECT 'pending'::TEXT, _approvals, _required;
  END IF;
END; $$;

-- RPC: cancel pending settlement (initiator only)
CREATE OR REPLACE FUNCTION public.cancel_expense_settlement(_settlement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid UUID := auth.uid(); _s RECORD;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _s FROM public.expense_settlements WHERE id = _settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF _s.initiated_by <> _uid THEN RAISE EXCEPTION 'Only the initiator can cancel'; END IF;
  IF _s.status <> 'pending' THEN RAISE EXCEPTION 'Not pending'; END IF;
  UPDATE public.expense_settlements SET status='cancelled' WHERE id = _settlement_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.start_expense_settlement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_expense_settlement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_expense_settlement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_expense_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expense_settlement(UUID) TO authenticated;
