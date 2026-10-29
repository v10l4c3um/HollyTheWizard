import { z } from "zod";
import { SpellSchema } from "../domain/magic/Spell";
import { NpcSchema } from "../domain/npc/Npc";
import { NpcProfileSchema } from "../domain/npc/NpcProfile";
import { LocationSchema } from "../domain/world/Location";
import {
	SubjectCurriculumSchema,
	SubjectDefinitionSchema,
	WeeklyTimetableSchema,
} from "../domain/quest/CurriculumContent";

// The shapes of the things a pack holds live next to the domain types they
// produce; this file only composes them into files and reports problems.

export { SpellSchema, NpcSchema, NpcProfileSchema, LocationSchema };
export type { LocationData } from "../domain/world/Location";

// ---------------------------------------------------------------------------
// Pack manifest v2
// ---------------------------------------------------------------------------

/** The kinds of content a pack can hold, as the names of its arrays. */
export const CONTENT_TYPES = [
	"locations",
	"npcs",
	"profiles",
	"spells",
	"subjects",
	"curriculums",
	"timetables",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** Content is grouped in folders by domain; a pack may only hold what its folder is for. */
export const CONTENT_DOMAINS = {
	world: ["locations"],
	npcs: ["npcs", "profiles"],
	spells: ["spells"],
	curriculum: ["subjects", "curriculums", "timetables"],
} as const satisfies Record<string, readonly ContentType[]>;

export type ContentDomain = keyof typeof CONTENT_DOMAINS;

export const PACK_FORMAT = 2;

const PackId = z
	.string()
	.regex(/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/, 'a dotted lowercase id such as "npcs.core"');

const Version = z.string().regex(/^\d+\.\d+\.\d+$/, 'a version such as "1.0.0"');

const Overrides = z.strictObject(
	Object.fromEntries(CONTENT_TYPES.map((type) => [type, z.array(z.string()).optional()])) as Record<
		ContentType,
		z.ZodOptional<z.ZodArray<z.ZodString>>
	>,
);

export const PackManifestSchema = z.strictObject({
	format: z.literal(PACK_FORMAT, { error: `a pack must say "format": ${PACK_FORMAT}` }),
	id: PackId,
	version: Version,
	name: z.string(),
	description: z.string().optional(),
	/** Packs that must be loaded first; `version` is the lowest acceptable (same major). */
	requires: z.array(z.strictObject({ id: PackId, version: Version.optional() })).default([]),
	locations: z.array(LocationSchema).optional(),
	npcs: z.array(NpcSchema).optional(),
	profiles: z.array(NpcProfileSchema).optional(),
	spells: z.array(SpellSchema).optional(),
	subjects: z.array(SubjectDefinitionSchema).optional(),
	curriculums: z.array(SubjectCurriculumSchema).optional(),
	timetables: z.array(WeeklyTimetableSchema).optional(),
	/** Ids of earlier content this pack deliberately replaces, per type. */
	overrides: Overrides.default({}),
});

export type PackManifest = z.infer<typeof PackManifestSchema>;

/**
 * One readable line per issue: which file, where in it (line:column when the
 * position is known), the path to the value, and what is wrong.
 */
export function formatIssues(
	file: string,
	error: z.ZodError,
	locate?: (path: (string | number)[], keys?: string[]) => { line: number; col: number } | undefined,
): string[] {
	return error.issues.map((issue) => {
		const where = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
		const keys = issue.code === "unrecognized_keys" ? issue.keys : undefined;
		const position = locate?.(issue.path as (string | number)[], keys);
		const at = position ? `${file}:${position.line}:${position.col}` : file;
		return `${at}: ${where}: ${issue.message}`;
	});
}
