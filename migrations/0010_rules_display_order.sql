CREATE TABLE _tmedit_rules_order_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_rules_order_guard
SELECT CASE WHEN
  (SELECT COUNT(*) FROM _emdash_collections WHERE slug = 'rules') = 1
  AND NOT EXISTS (SELECT 1 FROM _emdash_fields f JOIN _emdash_collections c ON c.id = f.collection_id WHERE c.slug = 'rules' AND f.slug = 'display_order')
  AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ec_rules') WHERE name = 'display_order')
THEN 1 ELSE 0 END;

ALTER TABLE ec_rules ADD COLUMN display_order INTEGER NOT NULL DEFAULT 100;
INSERT INTO _emdash_fields
  (id, collection_id, slug, label, type, column_type, required, "unique", default_value, sort_order, searchable, translatable, indexed)
SELECT '01M6GMDBXBFZ6XECPR124VB2HF', id, 'display_order', '表示順', 'integer', 'INTEGER', 1, 0, '100',
  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM _emdash_fields WHERE collection_id = c.id), 0, 0, 1
FROM _emdash_collections c WHERE slug = 'rules';

CREATE INDEX idx_cf_01m6gmdbxbfz6xecpr124vb2hf
ON ec_rules ((display_order IS NOT NULL), display_order, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cf_01m6gmdbxbfz6xecpr124vb2hf_loc
ON ec_rules (locale, (display_order IS NOT NULL), display_order, id) WHERE deleted_at IS NULL;

UPDATE _emdash_media_usage_index_status
SET change_epoch = change_epoch + 1, status = 'stale', completed_at = NULL,
  cursor = NULL, last_error_code = 'CONTENT_USAGE_STALE', reconciliation_required = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE adapter_id = 'content-media' AND scope_type = 'collection' AND scope_key = 'rules';
DROP TABLE _tmedit_rules_order_guard;
