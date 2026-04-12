-- Add the missing DELETE policy on applications so admins can remove
-- applications via the admin contacts UI. The table already has SELECT,
-- INSERT, and UPDATE policies for admins, but DELETE was never added.
CREATE POLICY "Admins can delete applications" ON public.applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
