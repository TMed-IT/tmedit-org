-- Reserve the public document routes without replacing existing content.
-- Refuse deployment if a page, draft or taxonomy already owns this root path.
CREATE TABLE _tmedit_docs_route_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_docs_route_guard
SELECT CASE WHEN
  NOT EXISTS (SELECT 1 FROM ec_pages WHERE slug = 'docs' AND deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = 'docs' AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages'))
  AND NOT EXISTS (SELECT 1 FROM revisions WHERE collection = 'pages' AND json_valid(data) AND json_extract(data, '$._slug') = 'docs')
THEN 1 ELSE 0 END;
DROP TABLE _tmedit_docs_route_guard;

-- Keep the old /documents reservation for its redirects and PDF files.
-- Add the /docs reservation without changing the applied constraints.
CREATE TRIGGER IF NOT EXISTS tmedit_docs_page_insert
BEFORE INSERT ON ec_pages
WHEN NEW.deleted_at IS NULL AND NEW.slug = 'docs'
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with the docs route');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_docs_page_update
BEFORE UPDATE OF slug, deleted_at ON ec_pages
WHEN NEW.deleted_at IS NULL AND NEW.slug = 'docs'
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with the docs route');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_docs_taxonomy_insert
BEFORE INSERT ON _emdash_taxonomy_def_groups
WHEN NEW.name = 'docs'
  AND EXISTS (SELECT 1 FROM json_each(NEW.collections) WHERE value = 'pages')
BEGIN
  SELECT RAISE(ABORT, 'taxonomy name conflicts with the docs route');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_docs_taxonomy_update
BEFORE UPDATE OF name, collections ON _emdash_taxonomy_def_groups
WHEN NEW.name = 'docs'
  AND EXISTS (SELECT 1 FROM json_each(NEW.collections) WHERE value = 'pages')
BEGIN
  SELECT RAISE(ABORT, 'taxonomy name conflicts with the docs route');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_docs_revision_insert
BEFORE INSERT ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data)
  AND json_extract(NEW.data, '$._slug') = 'docs'
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with the docs route');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_docs_revision_update
BEFORE UPDATE OF collection, data ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data)
  AND json_extract(NEW.data, '$._slug') = 'docs'
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with the docs route');
END;
