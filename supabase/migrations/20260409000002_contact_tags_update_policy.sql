-- Allow admins to update contact_tags (required for bulk upsert)
CREATE POLICY "Admins can update contact_tags" ON contact_tags
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
