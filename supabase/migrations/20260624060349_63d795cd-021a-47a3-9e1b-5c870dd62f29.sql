
CREATE POLICY "receipts_family_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.family_user_roles fur
    WHERE fur.user_id = auth.uid()
      AND fur.family_id::text = split_part(name, '/', 1)
  )
);

CREATE POLICY "receipts_family_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.family_user_roles fur
    WHERE fur.user_id = auth.uid()
      AND fur.family_id::text = split_part(name, '/', 1)
      AND fur.role IN ('owner','admin','member')
  )
);

CREATE POLICY "receipts_family_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.family_user_roles fur
    WHERE fur.user_id = auth.uid()
      AND fur.family_id::text = split_part(name, '/', 1)
      AND fur.role IN ('owner','admin','member')
  )
);

CREATE POLICY "receipts_family_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 FROM public.family_user_roles fur
    WHERE fur.user_id = auth.uid()
      AND fur.family_id::text = split_part(name, '/', 1)
      AND fur.role IN ('owner','admin','member')
  )
);
