-- EmDash 1.1 stores the shared structure in groups and mirrors it to locale rows.
-- Preserve existing targets, category terms, descriptions, and assignments.
CREATE TABLE _tmedit_page_categories_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_page_categories_guard
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM _emdash_collections WHERE slug = 'pages')
  AND EXISTS (SELECT 1 FROM _emdash_taxonomy_defs WHERE name = 'category')
  AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_defs WHERE name = 'category'
    AND (collections IS NULL OR NOT json_valid(collections) OR json_type(collections) <> 'array'))
  AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = 'category'
    AND (collections IS NULL OR NOT json_valid(collections) OR json_type(collections) <> 'array'))
THEN 1 ELSE 0 END;

-- Repair a missing group left by older code before updating the authoritative row.
INSERT INTO _emdash_taxonomy_def_groups (id, name, hierarchical, collections)
SELECT COALESCE(translation_group, id), name, hierarchical, collections
FROM _emdash_taxonomy_defs WHERE name = 'category'
ORDER BY locale, id LIMIT 1
ON CONFLICT (name) DO NOTHING;

UPDATE _emdash_taxonomy_def_groups
SET collections = json_insert(collections, '$[#]', 'pages')
WHERE name = 'category'
  AND NOT EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages');

UPDATE _emdash_taxonomy_defs
SET collections = (SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'),
  hierarchical = (SELECT hierarchical FROM _emdash_taxonomy_def_groups WHERE name = 'category'),
  translation_group = (SELECT id FROM _emdash_taxonomy_def_groups WHERE name = 'category')
WHERE name = 'category';
DROP TABLE _tmedit_page_categories_guard;
