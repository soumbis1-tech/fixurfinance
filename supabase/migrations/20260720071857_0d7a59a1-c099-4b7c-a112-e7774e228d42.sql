
-- Align settlement period_start to cycle boundary (1st or 16th) and
-- compute per-member totals on completion.

CREATE OR REPLACE FUNCTION public.start_expense_settlement(_family_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _existing UUID;
  _new_id UUID;
  _last_completed TIMESTAMP WITH TIME ZONE;
  _cycle_start TIMESTAMP WITH TIME ZONE;
  _period_start TIMESTAMP WITH TIME ZONE;
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

  SELECT MAX(completed_at) INTO _last_completed FROM public.expense_settlements
    WHERE family_id = _family_id AND status = 'completed';

  -- Current cycle start: 1st (day <= 15) or 16th of the current month
  IF EXTRACT(DAY FROM CURRENT_DATE)::INT <= 15 THEN
    _cycle_start := date_trunc('month', CURRENT_DATE);
  ELSE
    _cycle_start := date_trunc('month', CURRENT_DATE) + INTERVAL '15 days';
  END IF;

  -- Use the later of the last completed settlement and the current cycle start
  _period_start := GREATEST(COALESCE(_last_completed, _cycle_start), _cycle_start);

  INSERT INTO public.expense_settlements(family_id, initiated_by, period_start, period_end, status)
    VALUES (_family_id, _uid, _period_start, now(), 'pending')
    RETURNING id INTO _new_id;

  INSERT INTO public.expense_settlement_approvals(settlement_id, family_id, user_id)
    VALUES (_new_id, _family_id, _uid);

  RETURN _new_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.approve_expense_settlement(_settlement_id uuid)
 RETURNS TABLE(status text, approvals_count integer, required_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _s RECORD;
  _required INT;
  _approvals INT;
  _totals JSONB;
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
    -- Compute per-member totals for this settlement window
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'member_id', t.member_id,
          'name', t.name,
          'total', t.total,
          'count', t.count
        ) ORDER BY t.total DESC
      ),
      '[]'::jsonb
    ) INTO _totals
    FROM (
      SELECT
        e.paid_by AS member_id,
        COALESCE(m.display_name, 'Unassigned') AS name,
        SUM(e.amount)::NUMERIC AS total,
        COUNT(*)::INT AS count
      FROM public.expenses e
      LEFT JOIN public.family_members m ON m.id = e.paid_by
      WHERE e.family_id = _s.family_id
        AND e.type = 'expense'
        AND e.reimbursable = false
        AND e.trip_id IS NULL
        AND lower(COALESCE(e.comments, '')) NOT LIKE '%personal expense%'
        AND e.date >= (_s.period_start)::date
        AND e.date <= CURRENT_DATE
      GROUP BY e.paid_by, m.display_name
    ) t;

    UPDATE public.expense_settlements
      SET status = 'completed', completed_at = now(), period_end = now(), totals = _totals
      WHERE id = _settlement_id;
    RETURN QUERY SELECT 'completed'::TEXT, _approvals, _required;
  ELSE
    RETURN QUERY SELECT 'pending'::TEXT, _approvals, _required;
  END IF;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.start_expense_settlement(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_expense_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_expense_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense_settlement(uuid) TO authenticated;
