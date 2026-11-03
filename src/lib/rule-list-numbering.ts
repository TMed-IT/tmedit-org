type ListSegment = {
	kind: string;
	sourceId?: string;
	level: number;
	parent: number;
	items: number[];
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const listStart = (value: unknown): number | undefined => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647 ? value : undefined;

export function ruleListNumbers(blocks: unknown[]): Map<number, number> {
	const segments: ListSegment[] = [];
	const active = new Map<number, ListSegment>();
	const parents = new Map<number, number>();
	for (const [index, value] of blocks.entries()) {
		const block = record(value);
		if (block._type !== "block" || typeof block.listItem !== "string" || !Array.isArray(block.children)) {
			active.clear(); parents.clear();
			continue;
		}
		const level = typeof block.level === "number" && Number.isInteger(block.level) && block.level >= 1 ? block.level : 1;
		for (const key of active.keys()) if (key > level) active.delete(key);
		for (const key of parents.keys()) if (key > level) parents.delete(key);
		let parentLevel = 0;
		let parent = -1;
		for (const [key, item] of parents) {
			if (key < level && key > parentLevel) { parentLevel = key; parent = item; }
		}
		const id = typeof block.listId === "string" ? block.listId.trim() : "";
		const sourceId = block.listItem === "number" && id.length > 0 && id.length <= 128 ? id : undefined;
		let segment = active.get(level);
		if (!segment || segment.kind !== block.listItem || segment.sourceId !== sourceId || segment.parent !== parent) {
			segment = { kind: block.listItem, sourceId, level, parent, items: [] };
			segments.push(segment); active.set(level, segment);
		}
		segment.items.push(index);
		parents.set(level, index);
	}
	const scopes = new Map<ListSegment, string | ListSegment>();
	const bases = new Map<string | ListSegment, number>();
	for (const segment of segments) {
		if (segment.kind !== "number") continue;
		const scope = segment.sourceId ? JSON.stringify([segment.sourceId, segment.level, segment.parent]) : segment;
		scopes.set(segment, scope);
		if (!segment.sourceId || bases.has(scope)) continue;
		for (const index of segment.items) {
			const base = listStart(record(blocks[index]).listStart);
			if (base === undefined) continue;
			bases.set(scope, base);
			break;
		}
	}
	const counts = new Map<string | ListSegment, number>();
	const numbers = new Map<number, number>();
	for (const segment of segments) {
		if (segment.kind !== "number") continue;
		const scope = scopes.get(segment)!;
		const count = counts.get(scope) ?? 0;
		const start = listStart((bases.get(scope) ?? 1) + count) ?? 1;
		segment.items.forEach((index, offset) => numbers.set(index, start + offset));
		counts.set(scope, count + segment.items.length);
	}
	return numbers;
}
