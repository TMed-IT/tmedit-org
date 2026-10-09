/** Keep page attachments behind their page's access checks, including old draft references. */
export async function isPageAttachmentKey(db: D1Database, key: string): Promise<boolean> {
	const field = await db.prepare(`SELECT 1 FROM _emdash_fields f
		JOIN _emdash_collections c ON c.id = f.collection_id
		WHERE c.slug = 'pages' AND f.slug = 'document' AND f.type = 'file'`).first();
	if (!field) return false;
	const reference = await db.prepare(`SELECT 1 FROM ec_pages
		WHERE json_extract(document, '$.meta.storageKey') = ?
			OR json_extract(document, '$.id') = (SELECT id FROM media WHERE storage_key = ?)
		UNION ALL
		SELECT 1 FROM revisions WHERE collection = 'pages' AND (
			json_extract(data, '$.document.meta.storageKey') = ?
			OR json_extract(data, '$.document.id') = (SELECT id FROM media WHERE storage_key = ?))
		LIMIT 1`).bind(key, key, key, key).first();
	return reference !== null;
}
