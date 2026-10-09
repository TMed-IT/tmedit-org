-- Keep page aliases, category archives and reserved root routes distinct.
-- Existing content is retained; new conflicting writes are rejected.
CREATE TRIGGER IF NOT EXISTS tmedit_pages_slug_conflict_insert
BEFORE INSERT ON ec_pages
WHEN NEW.deleted_at IS NULL AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND slug = NEW.slug))
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with an existing route or category');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_pages_slug_conflict_update
BEFORE UPDATE OF slug, deleted_at ON ec_pages
WHEN NEW.deleted_at IS NULL AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND slug = NEW.slug))
BEGIN
  SELECT RAISE(ABORT, 'page slug conflicts with an existing route or category');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_category_slug_conflict_insert
BEFORE INSERT ON taxonomies
WHEN NEW.name = 'category' AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM ec_pages WHERE slug = NEW.slug AND deleted_at IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'category slug conflicts with an existing route or page');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_category_slug_conflict_update
BEFORE UPDATE OF name, slug ON taxonomies
WHEN NEW.name = 'category' AND ((NEW.slug IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR NEW.slug GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM ec_pages WHERE slug = NEW.slug AND deleted_at IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'category slug conflicts with an existing route or page');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_slug_conflict_insert
BEFORE INSERT ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data) AND ((json_extract(NEW.data, '$._slug') IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR json_extract(NEW.data, '$._slug') GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND slug = json_extract(NEW.data, '$._slug')))
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with an existing route or category');
END;

CREATE TRIGGER IF NOT EXISTS tmedit_revision_slug_conflict_update
BEFORE UPDATE OF collection, data ON revisions
WHEN NEW.collection = 'pages' AND json_valid(NEW.data) AND ((json_extract(NEW.data, '$._slug') IN ('newsroom', 'api', 'auth', 'subscribe', '_emdash', '_astro', '_image', 'login', '404', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'favicon.svg', 'icon-fill.svg', 'loading.svg', 'Icon.svg', '.', '..') OR json_extract(NEW.data, '$._slug') GLOB 'sitemap-*.xml') OR EXISTS (SELECT 1 FROM taxonomies WHERE name = 'category' AND slug = json_extract(NEW.data, '$._slug')))
BEGIN
  SELECT RAISE(ABORT, 'draft page slug conflicts with an existing route or category');
END;
