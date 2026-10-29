import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Small valid content, as it would appear in the JSON files. */

export const location = (
	id: string,
	connectedLocationsIds: string[] = [],
	aliases?: string[],
) => ({
	id,
	displayName: id.toUpperCase(),
	description: `The ${id}.`,
	connectedLocationsIds,
	...(aliases ? { aliases } : {}),
});

export const npc = (id: string, overrides: Record<string, unknown> = {}) => ({
	id,
	name: `Name of ${id}`,
	dialogue: ["Hello."],
	tag_description: "Friendly",
	schedule: { home: "forest" },
	...overrides,
});

export const profile = (
	npcId: string,
	overrides: Record<string, unknown> = {},
) => ({
	npcId,
	traits: ["kind"],
	hardBoundaries: [],
	topicAffinities: { daily_chat: 1 },
	...overrides,
});

export const spell = (id: string, overrides: Record<string, unknown> = {}) => ({
	definition: {
		id,
		name: `Spell ${id}`,
		description: "A spell.",
		level: "novice",
		usageType: "utility",
		range: "short",
		targetType: "single",
	},
	balance: {
		manaCost: 10,
		backfireRisk: "low",
		learningDifficulty: 0.3,
		practiceRequirement: 5,
		scaling: { intellect: 0.5 },
	},
	...overrides,
});

export const lesson = (
	subject: string,
	order: number,
	overrides: Record<string, unknown> = {},
) => ({
	id: `${subject}-1-${order}`,
	subjectType: subject,
	year: 1,
	order,
	title: `Lesson ${order}`,
	topic: "A topic",
	importance: "routine",
	rewards: { attributes: ["INT"], subjectKnowledge: { [subject]: 5 } },
	...overrides,
});

export const curriculum = (subject: string, lessons = [lesson(subject, 1)]) => ({
	subjectType: subject,
	year: 1,
	lessons,
});

export const subjects = (...ids: string[]) =>
	ids.map((id) => ({ type: id, name: id.toUpperCase(), description: `About ${id}.` }));

export const timetables = (...slots: Record<string, unknown>[]) => [{ year: 1, slots }];

export const classSlot = (subject: string, location = "forest") => ({
	day: "monday",
	period: "morning",
	type: "class",
	subject,
	location,
});

/** Creates a fresh temp directory and returns helpers to fill and remove it. */
export function tempDir(prefix = "holly-content-") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	return {
		dir,
		write(name: string, content: unknown) {
			const text =
				typeof content === "string" ? content : JSON.stringify(content);
			fs.writeFileSync(path.join(dir, name), text, "utf-8");
		},
		remove() {
			fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}

/** A pack as it would appear in a JSON file (format 2). */
export const manifest = (extra: Record<string, unknown>, header: Record<string, unknown> = {}) => ({
	format: 2,
	id: "test.pack",
	version: "1.0.0",
	name: "Test pack",
	...header,
	...extra,
});

/** The folders content lives in, one per domain. */
export type Domain = "world" | "npcs" | "spells" | "curriculum";

/** A temp content directory with the four domain folders. */
export function contentDir() {
	const root = tempDir("holly-content-root-");
	for (const domain of ["world", "npcs", "spells", "curriculum"] as const) {
		fs.mkdirSync(path.join(root.dir, domain));
	}
	return {
		...root,
		/** Writes `<domain>/<name>` (a pack, or raw text). */
		write(file: string, content: unknown) {
			const full = path.join(root.dir, file);
			fs.mkdirSync(path.dirname(full), { recursive: true });
			fs.writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
		},
	};
}
