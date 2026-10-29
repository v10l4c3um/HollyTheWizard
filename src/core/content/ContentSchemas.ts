import { z } from "zod";
import { Spell } from "../domain/magic/Spell";
import NPC from "../domain/npc/Npc";
import { NpcConversationProfile } from "../domain/npc/NpcProfile";
import { ATTRIBUTE_IDS } from "../domain/player/PlayerStats";
import {
	DAYS_OF_WEEK,
	PERIODS,
	TIMES_OF_DAY,
	Requirement,
	SCHOOL_YEARS,
	SpellRevealOpportunity,
	SUBJECT_TYPES,
	LessonDefinition,
	SubjectCurriculum,
	SubjectDefinition,
	SubjectType,
	WeeklyTimetable,
} from "../domain/quest/Curriculum";

/**
 * Shape of every content file. Objects are strict, so a misspelled key is an
 * error instead of being silently ignored. Each schema is annotated with the
 * domain type it produces, so the compiler keeps the two in step.
 */

const SubjectEnum = z.enum(SUBJECT_TYPES);
const SchoolYearSchema = z.literal(SCHOOL_YEARS);

// ---------------------------------------------------------------------------
// Packs: spells, NPCs, profiles, locations
// ---------------------------------------------------------------------------

const ConditionSchema = z.strictObject({
	type: z.enum(["quest", "attribute", "item", "location"]),
	value: z.union([z.string(), z.number()]),
	source: z.string().optional(),
});

export const SpellSchema: z.ZodType<Spell> = z.strictObject({
	definition: z.strictObject({
		id: z.string().min(1),
		name: z.string(),
		description: z.string(),
		level: z.enum(["unknown", "novice", "apprentice", "advanced", "expert"]),
		usageType: z.enum(["combat", "utility", "passive"]),
		range: z.enum(["self", "touch", "short", "ranged"]),
		targetType: z.enum(["self", "single", "group", "area", "passive"]),
		revealCondition: ConditionSchema.optional(),
		castCondition: ConditionSchema.optional(),
		visuals: z.string().optional(),
		sound: z.string().optional(),
		loreTag: z.string().optional(),
		/** Present in shipped content but not read by the game (it uses revealCondition/castCondition). */
		requiredConditions: z.array(z.unknown()).optional(),
	}),
	balance: z.strictObject({
		manaCost: z.number().min(0),
		backfireRisk: z.enum(["none", "low", "medium", "high"]),
		learningDifficulty: z.number().min(0).max(1),
		practiceRequirement: z.number().positive(),
		scaling: z.record(z.string(), z.number()),
	}),
});

const NpcScheduleSchema = z.strictObject({
	home: z.string().min(1),
	attendsClasses: z.boolean().optional(),
	teaches: z.array(SubjectEnum).optional(),
	slots: z
		.array(
			z.strictObject({
				days: z.array(z.enum(DAYS_OF_WEEK)).optional(),
				periods: z.array(z.enum(TIMES_OF_DAY)).optional(),
				location: z.string().min(1),
			}),
		)
		.optional(),
});

export const NpcSchema: z.ZodType<NPC> = z.strictObject({
	id: z.string().min(1),
	name: z.string().min(1),
	dialogue: z.array(z.string()),
	tag_description: z.string().default(""),
	/** In-world epithets, matched as whole phrases. Keep them few. */
	aliases: z.array(z.string()).default([]),
	schedule: NpcScheduleSchema.optional(),
	/** Present in shipped content but not read by the game. */
	affinity: z.number().optional(),
});

export const NpcProfileSchema: z.ZodType<NpcConversationProfile> = z.strictObject({
	npcId: z.string().min(1),
	traits: z.array(z.string()),
	hardBoundaries: z.array(z.string()),
	topicAffinities: z.record(z.string(), z.number()),
	locationModifiers: z.record(z.string(), z.number()).optional(),
});

export const LocationSchema = z.strictObject({
	id: z.string().min(1),
	displayName: z.string().min(1),
	description: z.string(),
	connectedLocationsIds: z.array(z.string()),
	/** Other names players use for the place ("the hut", "outside"). */
	aliases: z.array(z.string()).default([]),
	/** Nobody overhears here, so conversations can go further. */
	private: z.boolean().default(false),
});

export type LocationData = z.infer<typeof LocationSchema>;

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

// ---------------------------------------------------------------------------
// School data: subjects, curriculum, timetables
// ---------------------------------------------------------------------------

const RequirementSchema: z.ZodType<Requirement> = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("attribute"),
		id: z.enum(ATTRIBUTE_IDS),
		min: z.number(),
	}),
	z.strictObject({
		type: z.literal("subjectKnowledge"),
		subjectId: SubjectEnum,
		min: z.number(),
	}),
	z.strictObject({ type: z.literal("year"), min: SchoolYearSchema }),
	z.strictObject({ type: z.literal("spellKnown"), spellId: z.string() }),
]);

const RevealOpportunitySchema: z.ZodType<SpellRevealOpportunity> = z.strictObject({
	spellId: z.string().min(1),
	chance: z.number().min(0).max(1),
	grants: z.enum(["available", "learned"]).optional(),
	requirements: z.array(RequirementSchema),
	source: z.enum(["lesson", "location", "event", "npc", "item"]),
});

const LessonSchema: z.ZodType<LessonDefinition> = z.strictObject({
	id: z.string().min(1),
	subjectType: SubjectEnum,
	year: SchoolYearSchema,
	order: z.number().int().min(1),
	title: z.string(),
	topic: z.string(),
	importance: z.enum(["routine", "important", "exam", "story"]),
	rewards: z.strictObject({
		attributes: z.array(z.enum(ATTRIBUTE_IDS)).optional(),
		subjectKnowledge: z.partialRecord(SubjectEnum, z.number()).optional(),
	}),
	revealOpportunities: z.array(RevealOpportunitySchema).optional(),
});

export const CurriculumFileSchema: z.ZodType<SubjectCurriculum> = z.strictObject({
	subjectType: SubjectEnum,
	year: SchoolYearSchema,
	lessons: z.array(LessonSchema),
});

export const SubjectsFileSchema = z
	.partialRecord(
		SubjectEnum,
		z.strictObject({
			type: SubjectEnum,
			name: z.string(),
			description: z.string(),
		}),
	)
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

const TimetableSlotSchema = z
	.strictObject({
		day: z.enum(DAYS_OF_WEEK),
		period: z.enum(PERIODS),
		type: z.enum(["class", "free", "curfew"]),
		subject: SubjectEnum.optional(),
		location: z.string().min(1).optional(),
	})
	.refine((slot) => slot.type !== "class" || slot.subject !== undefined, {
		path: ["subject"],
		message: "a class slot needs a subject",
	})
	.refine((slot) => slot.type !== "class" || slot.location !== undefined, {
		path: ["location"],
		message: "a class slot needs a location",
	});

export const TimetablesFileSchema: z.ZodType<Record<string, WeeklyTimetable>> = z.record(
	z.string(),
	z.strictObject({
		year: SchoolYearSchema,
		slots: z.array(TimetableSlotSchema),
	}),
);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** One readable line per issue: which file, where in it, and what is wrong. */
export function formatIssues(file: string, error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const where = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
		return `${file}: ${where}: ${issue.message}`;
	});
}
