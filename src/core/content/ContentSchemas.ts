import { z } from "zod";
import { SpellSchema } from "../domain/magic/Spell";
import { NpcSchema } from "../domain/npc/Npc";
import { NpcProfileSchema } from "../domain/npc/NpcProfile";
import { LocationSchema } from "../domain/world/Location";
import { SUBJECT_TYPES, SubjectType } from "../domain/quest/Curriculum";
import {
	SubjectCurriculumSchema,
	SubjectDefinition,
	SubjectDefinitionSchema,
	WeeklyTimetableSchema,
} from "../domain/quest/CurriculumContent";

// The shapes of the things a pack holds live next to the domain types they
// produce; this file only composes them into files and reports problems.

export { SpellSchema, NpcSchema, NpcProfileSchema, LocationSchema };
export type { LocationData } from "../domain/world/Location";

export const PackManifestSchema = z.strictObject({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	locations: z.array(LocationSchema).optional(),
	npcs: z.array(NpcSchema).optional(),
	profiles: z.array(NpcProfileSchema).optional(),
	spells: z.array(SpellSchema).optional(),
});

export type PackManifest = z.infer<typeof PackManifestSchema>;

export const CurriculumFileSchema = SubjectCurriculumSchema;

export const SubjectsFileSchema = z
	.partialRecord(z.enum(SUBJECT_TYPES), SubjectDefinitionSchema)
	.superRefine((subjects, context) => {
		for (const [key, definition] of Object.entries(subjects)) {
			if (definition.type !== key) {
				context.addIssue({
					code: "custom",
					path: [key],
					message: `filed under "${key}" but says it is "${definition.type}"`,
				});
			}
		}
	});

export type SubjectsFile = Record<SubjectType, SubjectDefinition>;

export const TimetablesFileSchema = z.record(z.string(), WeeklyTimetableSchema);

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
