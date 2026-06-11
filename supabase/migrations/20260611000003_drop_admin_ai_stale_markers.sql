-- Drop stale-marking triggers/functions from the removed derived CRM AI memory layer.

DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_delete_trg
  ON applications;
DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_insert_trg
  ON applications;
DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_update_trg
  ON applications;

DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_delete_trg
  ON contact_notes;
DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_insert_trg
  ON contact_notes;
DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_update_trg
  ON contact_notes;

DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_delete_trg
  ON contact_tags;
DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_insert_trg
  ON contact_tags;
DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_update_trg
  ON contact_tags;

DROP TRIGGER IF EXISTS contacts_mark_admin_ai_memory_stale_update_trg
  ON contacts;

DROP TRIGGER IF EXISTS tags_mark_admin_ai_memory_stale_trg
  ON tags;

DROP FUNCTION IF EXISTS mark_admin_ai_contact_memory_stale(uuid);
DROP FUNCTION IF EXISTS mark_admin_ai_contact_memory_stale_set(uuid[]);
DROP FUNCTION IF EXISTS mark_admin_ai_contacts_for_tag_stale(uuid);
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_applications();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_applications_stmt();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contact_notes();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contact_notes_stmt();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contact_tags();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contact_tags_stmt();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contacts();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_contacts_stmt();
DROP FUNCTION IF EXISTS trg_mark_admin_ai_memory_stale_from_tags();
