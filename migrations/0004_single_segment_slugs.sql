-- Slugs are single path segments, including staged draft slugs.
-- These constraints are also restored after CMS resets by slug-policy.mjs.
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

CREATE TRIGGER IF NOT EXISTS tmedit_category_slug_insert
BEFORE INSERT ON taxonomies
WHEN NEW.name = 'category' AND (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'category slug cannot contain a slash');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_category_slug_update
BEFORE UPDATE OF name, slug ON taxonomies
WHEN NEW.name = 'category' AND (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0)
BEGIN
  SELECT RAISE(ABORT, 'category slug cannot contain a slash');
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
