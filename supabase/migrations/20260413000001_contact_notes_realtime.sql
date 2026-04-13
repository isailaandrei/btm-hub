ALTER PUBLICATION supabase_realtime ADD TABLE contact_notes;

ALTER TABLE contact_notes REPLICA IDENTITY FULL;
