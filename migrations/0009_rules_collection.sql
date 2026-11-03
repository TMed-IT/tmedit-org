CREATE TABLE _tmedit_rules_collection_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _tmedit_rules_collection_guard SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM _emdash_collections WHERE slug='rules') AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE name='ec_rules') THEN 1 ELSE 0 END;
CREATE TABLE "ec_rules" ("id" text primary key, "slug" text, "status" text default 'draft', "author_id" text, "primary_byline_id" text, "created_at" text default (datetime('now')), "updated_at" text default (datetime('now')), "published_at" text, "scheduled_at" text, "deleted_at" text, "version" integer default 1, "live_revision_id" text references "revisions" ("id"), "draft_revision_id" text references "revisions" ("id"), "locale" text default 'en' not null, "translation_group" text, "title" text default '' not null, "content" json default 'null' not null, "campus_only" integer default 1 not null, constraint "ec_rules_slug_locale_unique" unique ("slug", "locale"));
CREATE INDEX "idx_ec_rules_slug"
			ON "ec_rules" (slug)
		;
CREATE INDEX "idx_ec_rules_del_sched"
			ON "ec_rules" (deleted_at, scheduled_at)
			WHERE scheduled_at IS NOT NULL
		;
CREATE INDEX "idx_ec_rules_live_revision"
			ON "ec_rules" (live_revision_id)
		;
CREATE INDEX "idx_ec_rules_draft_revision"
			ON "ec_rules" (draft_revision_id)
		;
CREATE INDEX "idx_ec_rules_author"
			ON "ec_rules" (author_id)
		;
CREATE INDEX "idx_ec_rules_primary_byline"
			ON "ec_rules" (primary_byline_id)
		;
CREATE INDEX "idx_ec_rules_locale"
			ON "ec_rules" (locale)
		;
CREATE INDEX "idx_ec_rules_tg_locale"
			ON "ec_rules" (translation_group, locale)
		;
CREATE INDEX "idx_ec_rules_del_tg_locale"
			ON "ec_rules" (deleted_at, translation_group, locale)
		;
CREATE UNIQUE INDEX "uidx_ec_rules_active_tg_locale"
			ON "ec_rules" (translation_group, lower(locale))
			WHERE deleted_at IS NULL AND translation_group IS NOT NULL
		;
CREATE INDEX "idx_ec_rules_deleted_updated_id"
			ON "ec_rules" (deleted_at, updated_at DESC, id DESC)
		;
CREATE INDEX "idx_ec_rules_deleted_status"
			ON "ec_rules" (deleted_at, status)
		;
CREATE INDEX "idx_ec_rules_deleted_created_id"
			ON "ec_rules" (deleted_at, created_at DESC, id DESC)
		;
CREATE INDEX "idx_ec_rules_deleted_published_id"
			ON "ec_rules" (deleted_at, published_at DESC, id DESC)
		;
CREATE INDEX "idx_ec_rules_loc_upd"
			ON "ec_rules" (deleted_at, locale, updated_at DESC, id DESC)
		;
CREATE INDEX "idx_ec_rules_loc_crt"
			ON "ec_rules" (deleted_at, locale, created_at DESC, id DESC)
		;
INSERT INTO "_emdash_collections" ("id", "slug", "label", "label_singular", "description", "icon", "supports", "source", "created_at", "updated_at", "search_config", "has_seo", "url_pattern", "comments_enabled", "comments_moderation", "comments_closed_after_days", "comments_auto_approve_users", "hidden", "sort_order", "admin_config", "title_field", "date_field", "routable", "edit_locking", "nav_group") VALUES ('01M6GHJMBBFNZHPVQJEY30C70J', 'rules', '諸則', '諸則', NULL, NULL, '["drafts","revisions","seo"]', 'seed', '2026-11-03 11:09:13', '2026-11-03 11:09:13', NULL, 1, '/docs/{slug}', 0, 'first_time', 90, 1, 0, NULL, NULL, NULL, NULL, 1, 1, NULL);
INSERT INTO "_emdash_fields" ("id", "collection_id", "slug", "label", "type", "column_type", "required", "unique", "default_value", "validation", "widget", "options", "sort_order", "created_at", "searchable", "translatable", "indexed") VALUES ('01M6GHJMBB3030DX6KR6T4MABJ', '01M6GHJMBBFNZHPVQJEY30C70J', 'title', 'タイトル', 'string', 'TEXT', 1, 0, NULL, NULL, NULL, NULL, 0, '2026-11-03 11:09:13', 0, 1, 0);
INSERT INTO "_emdash_fields" ("id", "collection_id", "slug", "label", "type", "column_type", "required", "unique", "default_value", "validation", "widget", "options", "sort_order", "created_at", "searchable", "translatable", "indexed") VALUES ('01M6GHJMBBK2HNAZ3QWHR5E4NZ', '01M6GHJMBBFNZHPVQJEY30C70J', 'content', '本文', 'portableText', 'JSON', 1, 0, NULL, NULL, NULL, NULL, 1, '2026-11-03 11:09:13', 0, 1, 0);
INSERT INTO "_emdash_fields" ("id", "collection_id", "slug", "label", "type", "column_type", "required", "unique", "default_value", "validation", "widget", "options", "sort_order", "created_at", "searchable", "translatable", "indexed") VALUES ('01M6GHJMBB7NPQE6SE4KBYGMZ2', '01M6GHJMBBFNZHPVQJEY30C70J', 'campus_only', '学内限定', 'boolean', 'INTEGER', 1, 0, 'true', NULL, NULL, NULL, 2, '2026-11-03 11:09:13', 0, 1, 0);
INSERT INTO "_emdash_media_usage_index_status" ("adapter_id", "scope_type", "scope_key", "status", "schema_version", "started_at", "completed_at", "cursor", "indexed_source_count", "failed_source_count", "last_error_code", "updated_at", "collection_id", "change_epoch", "reconciliation_required", "last_incremental_success_at", "capture_state") VALUES ('content-media', 'collection', 'rules', 'stale', 1, NULL, NULL, NULL, 0, 0, 'CONTENT_USAGE_STALE', '2026-11-03T11:09:13.455Z', '01M6GHJMBBFNZHPVQJEY30C70J', 0, 1, NULL, 'active');
CREATE TRIGGER "emdash_mu_36fc773c97f360d20d2695c1f76b6ce1_ai"
		AFTER INSERT ON "ec_rules"
		FOR EACH ROW
		BEGIN
			UPDATE _emdash_media_usage_index_status
			SET change_epoch = change_epoch + 1,
				status = CASE WHEN status = 'complete' THEN 'stale' ELSE status END,
				completed_at = CASE WHEN status = 'complete' THEN NULL ELSE completed_at END,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
				AND EXISTS (
					SELECT 1
					FROM _emdash_collections AS collection
					WHERE collection.id = '01M6GHJMBBFNZHPVQJEY30C70J'
						AND collection.slug = 'rules'
				);

			SELECT CASE
				WHEN changes() <> 1 THEN RAISE(ABORT, 'media usage capture inactive')
			END;

			INSERT INTO _emdash_media_usage_work (
				collection_id,
				collection_slug,
				content_id,
				change_epoch,
				work_version,
				state,
				attempt_count,
				next_attempt_at,
				lease_token,
				lease_expires_at,
				last_attempted_at,
				last_error_code,
				created_at,
				updated_at
			)
			SELECT
				'01M6GHJMBBFNZHPVQJEY30C70J',
				'rules',
				NEW.id,
				change_epoch,
				1,
				'pending',
				0,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				NULL,
				NULL,
				NULL,
				NULL,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			FROM _emdash_media_usage_index_status
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
			ON CONFLICT (collection_id, content_id) DO UPDATE SET
				collection_slug = excluded.collection_slug,
				change_epoch = excluded.change_epoch,
				work_version = _emdash_media_usage_work.work_version + 1,
				state = 'pending',
				attempt_count = 0,
				next_attempt_at = excluded.next_attempt_at,
				lease_token = NULL,
				lease_expires_at = NULL,
				last_attempted_at = NULL,
				last_error_code = NULL,
				updated_at = excluded.updated_at;
		END;
CREATE TRIGGER "emdash_mu_36fc773c97f360d20d2695c1f76b6ce1_au"
		AFTER UPDATE ON "ec_rules"
		FOR EACH ROW
		BEGIN
			UPDATE _emdash_media_usage_index_status
			SET change_epoch = change_epoch + 1,
				status = CASE WHEN status = 'complete' THEN 'stale' ELSE status END,
				completed_at = CASE WHEN status = 'complete' THEN NULL ELSE completed_at END,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
				AND EXISTS (
					SELECT 1
					FROM _emdash_collections AS collection
					WHERE collection.id = '01M6GHJMBBFNZHPVQJEY30C70J'
						AND collection.slug = 'rules'
				);

			SELECT CASE
				WHEN changes() <> 1 THEN RAISE(ABORT, 'media usage capture inactive')
			END;

			INSERT INTO _emdash_media_usage_work (
				collection_id,
				collection_slug,
				content_id,
				change_epoch,
				work_version,
				state,
				attempt_count,
				next_attempt_at,
				lease_token,
				lease_expires_at,
				last_attempted_at,
				last_error_code,
				created_at,
				updated_at
			)
			SELECT
				'01M6GHJMBBFNZHPVQJEY30C70J',
				'rules',
				NEW.id,
				change_epoch,
				1,
				'pending',
				0,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				NULL,
				NULL,
				NULL,
				NULL,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			FROM _emdash_media_usage_index_status
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
			ON CONFLICT (collection_id, content_id) DO UPDATE SET
				collection_slug = excluded.collection_slug,
				change_epoch = excluded.change_epoch,
				work_version = _emdash_media_usage_work.work_version + 1,
				state = 'pending',
				attempt_count = 0,
				next_attempt_at = excluded.next_attempt_at,
				lease_token = NULL,
				lease_expires_at = NULL,
				last_attempted_at = NULL,
				last_error_code = NULL,
				updated_at = excluded.updated_at;
		END;
CREATE TRIGGER "emdash_mu_36fc773c97f360d20d2695c1f76b6ce1_ad"
		AFTER DELETE ON "ec_rules"
		FOR EACH ROW
		BEGIN
			UPDATE _emdash_media_usage_index_status
			SET change_epoch = change_epoch + 1,
				status = CASE WHEN status = 'complete' THEN 'stale' ELSE status END,
				completed_at = CASE WHEN status = 'complete' THEN NULL ELSE completed_at END,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
				AND EXISTS (
					SELECT 1
					FROM _emdash_collections AS collection
					WHERE collection.id = '01M6GHJMBBFNZHPVQJEY30C70J'
						AND collection.slug = 'rules'
				);

			SELECT CASE
				WHEN changes() <> 1 THEN RAISE(ABORT, 'media usage capture inactive')
			END;

			INSERT INTO _emdash_media_usage_work (
				collection_id,
				collection_slug,
				content_id,
				change_epoch,
				work_version,
				state,
				attempt_count,
				next_attempt_at,
				lease_token,
				lease_expires_at,
				last_attempted_at,
				last_error_code,
				created_at,
				updated_at
			)
			SELECT
				'01M6GHJMBBFNZHPVQJEY30C70J',
				'rules',
				OLD.id,
				change_epoch,
				1,
				'pending',
				0,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				NULL,
				NULL,
				NULL,
				NULL,
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
				strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
			FROM _emdash_media_usage_index_status
			WHERE adapter_id = 'content-media'
				AND scope_type = 'collection'
				AND scope_key = 'rules'
				AND collection_id = '01M6GHJMBBFNZHPVQJEY30C70J'
				AND capture_state = 'active'
			ON CONFLICT (collection_id, content_id) DO UPDATE SET
				collection_slug = excluded.collection_slug,
				change_epoch = excluded.change_epoch,
				work_version = _emdash_media_usage_work.work_version + 1,
				state = 'pending',
				attempt_count = 0,
				next_attempt_at = excluded.next_attempt_at,
				lease_token = NULL,
				lease_expires_at = NULL,
				last_attempted_at = NULL,
				last_error_code = NULL,
				updated_at = excluded.updated_at;
		END;
CREATE TRIGGER tmedit_rules_slug_insert BEFORE INSERT ON ec_rules WHEN NEW.slug IS NOT NULL AND (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0) BEGIN SELECT RAISE(ABORT, 'rule slug must be one path segment'); END;
CREATE TRIGGER tmedit_rules_slug_update BEFORE UPDATE OF slug ON ec_rules WHEN NEW.slug IS NOT NULL AND (instr(NEW.slug, '/') > 0 OR instr(lower(NEW.slug), '%2f') > 0) BEGIN SELECT RAISE(ABORT, 'rule slug must be one path segment'); END;
CREATE TRIGGER tmedit_rules_draft_insert BEFORE INSERT ON revisions WHEN NEW.collection='rules' AND json_valid(NEW.data) AND (instr(json_extract(NEW.data, '$._slug'), '/') > 0 OR instr(lower(json_extract(NEW.data, '$._slug')), '%2f') > 0) BEGIN SELECT RAISE(ABORT, 'rule slug must be one path segment'); END;
CREATE TRIGGER tmedit_rules_draft_update BEFORE UPDATE OF collection, data ON revisions WHEN NEW.collection='rules' AND json_valid(NEW.data) AND (instr(json_extract(NEW.data, '$._slug'), '/') > 0 OR instr(lower(json_extract(NEW.data, '$._slug')), '%2f') > 0) BEGIN SELECT RAISE(ABORT, 'rule slug must be one path segment'); END;
DROP TABLE _tmedit_rules_collection_guard;
