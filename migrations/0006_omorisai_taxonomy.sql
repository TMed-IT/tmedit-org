-- Run directly with Wrangler; do not rewrite the already-applied migrations.
-- Convert the one existing category to the flat omorisai taxonomy, preserving
-- term IDs / translation groups so every page assignment remains intact.
CREATE TABLE _tmedit_omorisai_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_omorisai_guard
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM _emdash_collections WHERE slug = 'pages')
  AND NOT EXISTS (SELECT 1 FROM ec_pages WHERE slug = 'omorisai' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND slug NOT IN ('omorisai26', 'omorisai2026'))
  AND NOT EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND parent_id IS NOT NULL)
  AND (
    ((SELECT COUNT(*) FROM taxonomies WHERE name = 'category') = 1
      AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = 'omorisai'))
    OR (NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = 'category')
      AND EXISTS (SELECT 1 FROM taxonomies WHERE name = 'omorisai' AND slug = '2026'))
  )
THEN 1 ELSE 0 END;

UPDATE _emdash_taxonomy_def_groups SET name = 'omorisai', hierarchical = 0, collections = '["pages"]'
WHERE name = 'category';
UPDATE _emdash_taxonomy_defs SET name = 'omorisai', label = '大森祭', label_singular = '大森祭',
  hierarchical = 0, collections = '["pages"]' WHERE name = 'category';
UPDATE taxonomies SET name = 'omorisai', slug = '2026', label = '2026', parent_id = NULL
WHERE name = 'category' AND slug IN ('omorisai26', 'omorisai2026');

-- Exact old URLs remain usable; only the public URL changes, not the content.
INSERT INTO _emdash_redirects (id, source, destination, type, is_pattern, enabled, group_name, source_guard)
SELECT 'tmedit-omorisai-root-' || old.slug, '/' || old.slug, '/omorisai/2026', 301, 0, 1, 'taxonomy-migration', 1
FROM (SELECT 'omorisai26' AS slug UNION ALL SELECT 'omorisai2026') old
WHERE NOT EXISTS (SELECT 1 FROM _emdash_redirects r WHERE r.source = '/' || old.slug);
INSERT INTO _emdash_redirects (id, source, destination, type, is_pattern, enabled, group_name, source_guard)
SELECT 'tmedit-omorisai-page-' || old.slug || '-' || p.id, '/' || old.slug || '/' || p.slug,
  '/omorisai/2026/' || p.slug, 301, 0, 1, 'taxonomy-migration', 1
FROM ec_pages p JOIN content_taxonomies ct ON ct.collection = 'pages' AND ct.entry_id = p.translation_group
JOIN taxonomies t ON t.translation_group = ct.taxonomy_id AND t.name = 'omorisai' AND t.slug = '2026'
CROSS JOIN (SELECT 'omorisai26' AS slug UNION ALL SELECT 'omorisai2026') old
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM _emdash_redirects r WHERE r.source = '/' || old.slug || '/' || p.slug);

-- Update taxonomy-backed menu references and old custom archive/page URLs.
UPDATE _emdash_menu_items SET reference_collection = 'omorisai'
WHERE type = 'taxonomy' AND reference_collection = 'category';
UPDATE _emdash_menu_items SET custom_url = '/omorisai/2026'
WHERE custom_url IN ('/omorisai26', '/omorisai2026');
UPDATE _emdash_menu_items SET custom_url = (SELECT destination FROM _emdash_redirects r
  WHERE r.source = _emdash_menu_items.custom_url AND r.group_name = 'taxonomy-migration' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM _emdash_redirects r WHERE r.source = _emdash_menu_items.custom_url AND r.group_name = 'taxonomy-migration');
DROP TABLE _tmedit_omorisai_guard;

-- Replace category-specific constraints with taxonomy namespace constraints.
DROP TRIGGER IF EXISTS tmedit_category_slug_insert;

DROP TRIGGER IF EXISTS tmedit_category_slug_update;

DROP TRIGGER IF EXISTS tmedit_pages_slug_conflict_insert;

DROP TRIGGER IF EXISTS tmedit_pages_slug_conflict_update;

DROP TRIGGER IF EXISTS tmedit_category_slug_conflict_insert;

DROP TRIGGER IF EXISTS tmedit_category_slug_conflict_update;

DROP TRIGGER IF EXISTS tmedit_revision_slug_conflict_insert;

DROP TRIGGER IF EXISTS tmedit_revision_slug_conflict_update;

CREATE TRIGGER IF NOT EXISTS tmedit_pages_slug_insert
BEFORE INSERT ON ec_pages
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_pages_slug_update
BEFORE UPDATE OF slug ON ec_pages
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_news_slug_insert
BEFORE INSERT ON ec_news
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_news_slug_update
BEFORE UPDATE OF slug ON ec_news
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_term_slug_insert
BEFORE INSERT ON taxonomies
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0) OR NEW.slug IN ('.', '..')
BEGIN
  SELECT RAISE(ABORT, 'term slug must be one path segment');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_term_slug_update
BEFORE UPDATE OF slug ON taxonomies
WHEN (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0) OR NEW.slug IN ('.', '..')
BEGIN
  SELECT RAISE(ABORT, 'term slug must be one path segment');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_slug_insert
BEFORE INSERT ON revisions
WHEN NEW.collection IN ('pages', 'news') AND json_valid(NEW.data) AND (instr(json_extract(NEW.data, '$._slug'), '/') > 0 OR instr(lower(json_extract(NEW.data, '$._slug')), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'draft slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_slug_update
BEFORE UPDATE OF collection, data ON revisions
WHEN NEW.collection IN ('pages', 'news') AND json_valid(NEW.data) AND (instr(json_extract(NEW.data, '$._slug'), '/') > 0 OR instr(lower(json_extract(NEW.data, '$._slug')), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'draft slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_pages_taxonomy_conflict_insert
BEFORE INSERT ON ec_pages
WHEN NEW.deleted_at IS NULL AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = NEW.slug AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages')))
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with an existing route or taxonomy');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_pages_taxonomy_conflict_update
BEFORE UPDATE OF slug, deleted_at ON ec_pages
WHEN NEW.deleted_at IS NULL AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = NEW.slug AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages')))
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with an existing route or taxonomy');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_taxonomy_name_conflict_insert
BEFORE INSERT ON _emdash_taxonomy_def_groups
WHEN EXISTS (SELECT 1 FROM json_each(NEW.collections) WHERE value = 'pages') AND ((NEW.name IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.name GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM ec_pages WHERE slug = NEW.name AND deleted_at IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'taxonomy name conflicts with an existing route or page');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_taxonomy_name_conflict_update
BEFORE UPDATE OF name, collections ON _emdash_taxonomy_def_groups
WHEN EXISTS (SELECT 1 FROM json_each(NEW.collections) WHERE value = 'pages') AND ((NEW.name IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.name GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM ec_pages WHERE slug = NEW.name AND deleted_at IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'taxonomy name conflicts with an existing route or page');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_taxonomy_conflict_insert
BEFORE INSERT ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data) AND ((json_extract(NEW.data, '$._slug') IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR json_extract(NEW.data, '$._slug') GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = json_extract(NEW.data, '$._slug') AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages')))
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with an existing route or taxonomy');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_taxonomy_conflict_update
BEFORE UPDATE OF collection, data ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data) AND ((json_extract(NEW.data, '$._slug') IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'omorisai26', 'omorisai2026', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR json_extract(NEW.data, '$._slug') GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = json_extract(NEW.data, '$._slug') AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages')))
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with an existing route or taxonomy');
END;
