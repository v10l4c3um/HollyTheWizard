import { z } from "zod";
import { ATTRIBUTE_IDS } from "../player/PlayerStats";
import { DAYS_OF_WEEK, PERIODS, SCHOOL_YEARS, SUBJECT_TYPES } from "./Curriculum";

/**
 * The shape of school content in a pack: subjects, lessons, the spells a
 * lesson may reveal, and the weekly timetable. The schemas are the single
 * source; the types are inferred from them. Objects are strict, so a
 * misspelled key is an error.
 */

const SubjectEnum = z.enum(SUBJECT_TYPES);
const SchoolYearSchema = z.literal(SCHOOL_YEARS);

export const SubjectDefinitionSchema = z.strictObject({
	type: SubjectEnum,
	name: z.string(),
	description: z.string(),
});

export const RequirementSchema = z.discriminatedUnion("type", [
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

export const SpellRevealOpportunitySchema = z.strictObject({
	spellId: z.string().min(1),
	/** 0 to 1. */
	chance: z.number().min(0).max(1),
	/**
	 * What a successful opportunity does: "available" only lets the player know
	 * of the spell (a rumour, a sighting); "learned" means the source teaches
	 * it. Defaults to "available".
	 */
	grants: z.enum(["available", "learned"]).optional(),
	requirements: z.array(RequirementSchema),
	source: z.enum(["lesson", "location", "event", "npc", "item"]),
});

const LessonRewardSchema = z.strictObject({
	attributes: z.array(z.enum(ATTRIBUTE_IDS)).optional(),
	subjectKnowledge: z.partialRecord(SubjectEnum, z.number()).optional(),
});

export const LessonSchema = z.strictObject({
	id: z.string().min(1),
	subjectType: SubjectEnum,
	year: SchoolYearSchema,
	order: z.number().int().min(1),
	title: z.string(),
	topic: z.string(),
	importance: z.enum(["routine", "important", "exam", "story"]),
	rewards: LessonRewardSchema,
	revealOpportunities: z.array(SpellRevealOpportunitySchema).optional(),
});

export const SubjectCurriculumSchema = z.strictObject({
	subjectType: SubjectEnum,
	year: SchoolYearSchema,
	lessons: z.array(LessonSchema),
});

export const TimetableSlotSchema = z
	.strictObject({
		day: z.enum(DAYS_OF_WEEK),
		period: z.enum(PERIODS),
		type: z.enum(["class", "free", "curfew"]),
		subject: SubjectEnum.optional(),
		/** Where a class is held. Required for class slots. */
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

export const WeeklyTimetableSchema = z.strictObject({
	year: SchoolYearSchema,
	slots: z.array(TimetableSlotSchema),
});

export type SubjectDefinition = z.infer<typeof SubjectDefinitionSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type SpellRevealOpportunity = z.infer<typeof SpellRevealOpportunitySchema>;
export type LessonReward = z.infer<typeof LessonRewardSchema>;
export type LessonDefinition = z.infer<typeof LessonSchema>;
export type SubjectCurriculum = z.infer<typeof SubjectCurriculumSchema>;
export type TimetableSlot = z.infer<typeof TimetableSlotSchema>;
export type WeeklyTimetable = z.infer<typeof WeeklyTimetableSchema>;
