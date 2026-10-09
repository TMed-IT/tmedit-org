-- Replace the legacy post/posts taxonomy targets with pages. Keep other targets,
-- category labels, terms, descriptions, hierarchy, and all page assignments.
CREATE TABLE _tmedit_legacy_posts_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_legacy_posts_guard
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM _emdash_collections WHERE slug = 'pages')
  AND EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = 'category')
  AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups
    WHERE collections IS NULL OR NOT json_valid(collections) OR json_type(collections) <> 'array')
THEN 1 ELSE 0 END;

CREATE TABLE _tmedit_legacy_only_taxonomies (name TEXT PRIMARY KEY);
INSERT INTO _tmedit_legacy_only_taxonomies
SELECT name FROM _emdash_taxonomy_def_groups
WHERE name <> 'category'
  AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value IN ('post', 'posts'))
  AND NOT EXISTS (SELECT 1 FROM json_each(collections) WHERE value NOT IN ('post', 'posts'));

UPDATE _emdash_taxonomy_def_groups
SET collections = (
  SELECT json_group_array(value) FROM json_each(collections) WHERE value NOT IN ('post', 'posts')
);
UPDATE _emdash_taxonomy_def_groups
SET collections = json_insert(collections, '$[#]', 'pages')
WHERE name = 'category'
  AND NOT EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages');
UPDATE _emdash_taxonomy_defs
SET collections = (SELECT g.collections FROM _emdash_taxonomy_def_groups g
  WHERE g.name = _emdash_taxonomy_defs.name);

DELETE FROM content_taxonomies WHERE collection IN ('post', 'posts')
  OR taxonomy_id IN (SELECT COALESCE(translation_group, id) FROM taxonomies
    WHERE name IN (SELECT name FROM _tmedit_legacy_only_taxonomies));
DELETE FROM taxonomies WHERE name IN (SELECT name FROM _tmedit_legacy_only_taxonomies);
DELETE FROM _emdash_taxonomy_defs WHERE name IN (SELECT name FROM _tmedit_legacy_only_taxonomies);
DELETE FROM _emdash_taxonomy_def_groups WHERE name IN (SELECT name FROM _tmedit_legacy_only_taxonomies);

-- The CMS currently routes previews and menus through /{slug}; the site redirects
-- categorized pages to their category URL and retains uncategorized fixed pages.
UPDATE _emdash_collections SET url_pattern = '/{slug}' WHERE slug = 'pages';

-- Remove legacy content and its metadata, including orphaned rows whose
-- collection no longer appears in the admin. Uploaded media itself is retained.
-- Drop content before revisions: live_revision_id/draft_revision_id are foreign keys.
DROP TRIGGER IF EXISTS _emdash_fts_post_insert;
DROP TRIGGER IF EXISTS _emdash_fts_post_update;
DROP TRIGGER IF EXISTS _emdash_fts_post_delete;
DROP TRIGGER IF EXISTS _emdash_fts_posts_insert;
DROP TRIGGER IF EXISTS _emdash_fts_posts_update;
DROP TRIGGER IF EXISTS _emdash_fts_posts_delete;
DROP TABLE IF EXISTS _emdash_fts_post;
DROP TABLE IF EXISTS _emdash_fts_posts;
DROP TABLE IF EXISTS ec_post;
DROP TABLE IF EXISTS ec_posts;

DELETE FROM _emdash_comment_reactions WHERE comment_id IN
  (SELECT id FROM _emdash_comments WHERE collection IN ('post', 'posts'));
DELETE FROM _emdash_comments WHERE collection IN ('post', 'posts');
DELETE FROM revisions WHERE collection IN ('post', 'posts');
DELETE FROM _emdash_seo WHERE collection IN ('post', 'posts');
DELETE FROM _emdash_revision_prune_queue WHERE collection IN ('post', 'posts');
DELETE FROM _emdash_entry_locks WHERE collection IN ('post', 'posts');
DELETE FROM _emdash_content_bylines WHERE collection_slug IN ('post', 'posts');
DELETE FROM _emdash_menu_items WHERE reference_collection IN ('post', 'posts');
DELETE FROM _emdash_content_references WHERE relation_id IN
  (SELECT id FROM _emdash_relations WHERE parent_collection IN ('post', 'posts')
    OR child_collection IN ('post', 'posts'));
DELETE FROM _emdash_relations WHERE parent_collection IN ('post', 'posts')
  OR child_collection IN ('post', 'posts');

DELETE FROM _emdash_media_usage WHERE source_key IN
  (SELECT source_key FROM _emdash_media_usage_sources WHERE collection_slug IN ('post', 'posts'));
DELETE FROM _emdash_media_usage_generation_writes WHERE source_key IN
  (SELECT source_key FROM _emdash_media_usage_sources WHERE collection_slug IN ('post', 'posts'));
DELETE FROM _emdash_media_usage_sources WHERE collection_slug IN ('post', 'posts');
DELETE FROM _emdash_media_usage_work WHERE collection_slug IN ('post', 'posts');
DELETE FROM _emdash_media_usage_collection_deletions WHERE collection_slug IN ('post', 'posts');
DELETE FROM _emdash_media_usage_reconciliations WHERE collection_slug IN ('post', 'posts');
DELETE FROM _emdash_media_usage_index_status WHERE scope_type = 'collection' AND scope_key IN ('post', 'posts');

DELETE FROM _emdash_fields WHERE collection_id IN
  (SELECT id FROM _emdash_collections WHERE slug IN ('post', 'posts'));
DELETE FROM _emdash_collections WHERE slug IN ('post', 'posts');

DROP TABLE _tmedit_legacy_only_taxonomies;
DROP TABLE _tmedit_legacy_posts_guard;
