-- EmDash 1.1: add an optional PDF field without resetting pages or revisions.
-- D1 migrations apply runs this file and its history entry atomically.
CREATE TABLE _tmedit_page_document_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_page_document_guard
SELECT CASE WHEN
  (SELECT COUNT(*) FROM _emdash_collections WHERE slug = 'pages') = 1
  AND NOT EXISTS (SELECT 1 FROM _emdash_fields f
    JOIN _emdash_collections c ON c.id = f.collection_id
    WHERE c.slug = 'pages' AND f.slug = 'document')
  AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ec_pages') WHERE name = 'document')
  AND (NOT EXISTS (SELECT 1 FROM _emdash_media_usage_activation
      WHERE task_key = 'incremental_capture' AND state = 'active')
    OR EXISTS (SELECT 1 FROM _emdash_media_usage_index_status s
      JOIN _emdash_collections c ON c.id = s.collection_id AND c.slug = s.scope_key
      WHERE s.adapter_id = 'content-media' AND s.scope_type = 'collection'
        AND s.scope_key = 'pages' AND s.capture_state = 'active'))
THEN 1 ELSE 0 END;

ALTER TABLE ec_pages ADD COLUMN document TEXT;
INSERT INTO _emdash_fields
  (id, collection_id, slug, label, type, column_type, required, "unique",
   validation, sort_order, searchable, translatable, indexed)
SELECT '01M4G9P7XW92K1Z2FWW0QWR1BB', c.id, 'document', '添付PDF', 'file', 'TEXT', 0, 0,
  '{"allowedMimeTypes":["application/pdf"]}',
  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM _emdash_fields WHERE collection_id = c.id),
  0, 1, 0
FROM _emdash_collections c WHERE c.slug = 'pages';

-- Mirror SchemaRegistry's media usage invalidation for an active collection.
UPDATE _emdash_media_usage_index_status
SET change_epoch = change_epoch + 1, status = 'stale', completed_at = NULL,
  cursor = NULL, last_error_code = 'CONTENT_USAGE_STALE', reconciliation_required = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE adapter_id = 'content-media' AND scope_type = 'collection' AND scope_key = 'pages'
  AND capture_state = 'active'
  AND EXISTS (SELECT 1 FROM _emdash_media_usage_activation
    WHERE task_key = 'incremental_capture' AND state = 'active');

-- Also support databases where incremental media capture has not been activated.
INSERT INTO _emdash_media_usage_index_status
  (adapter_id, scope_type, scope_key, status, schema_version, last_error_code, updated_at)
SELECT 'content-media', 'collection', 'pages', 'stale', 2, 'CONTENT_USAGE_STALE',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM _emdash_media_usage_activation
  WHERE task_key = 'incremental_capture' AND state = 'active')
ON CONFLICT (adapter_id, scope_type, scope_key) DO UPDATE SET
  status = 'stale', last_error_code = 'CONTENT_USAGE_STALE', updated_at = excluded.updated_at;
DROP TABLE _tmedit_page_document_guard;
