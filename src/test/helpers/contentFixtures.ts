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
	Object.fromEntries(
		ids.map((id) => [
			id,
			{ type: id, name: id.toUpperCase(), description: `About ${id}.` },
		]),
	);

export const timetables = (...slots: Record<string, unknown>[]) => ({
	year1: { year: 1, slots },
});

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

export const manifest = (extra: Record<string, unknown>) => ({
	name: "Test pack",
	version: "1.0.0",
	...extra,
});
