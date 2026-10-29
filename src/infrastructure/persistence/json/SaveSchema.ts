import { z } from "zod";
import { ATTRIBUTE_IDS } from "../../../core/domain/player/PlayerStats";
import {
	SCHOOL_YEARS,
	SUBJECT_TYPES,
} from "../../../core/domain/quest/Curriculum";
import { SAVE_FORMAT_VERSION } from "../../../core/domain/world/GameState";

/**
 * The shape of a save file. Every part is required: a save that is missing
 * something is refused rather than patched with defaults. Blueprints are
 * checked for presence and shape only; their contents are the blueprint
 * pipeline's business.
 */

const schoolYear = z.union(
	SCHOOL_YEARS.map((year) => z.literal(year)) as unknown as [
		z.ZodLiteral<number>,
		z.ZodLiteral<number>,
		...z.ZodLiteral<number>[],
	],
);

const spellState = z.object({
	spellId: z.string(),
	proficiency: z.number(),
	practicePoints: z.number(),
	stability: z.number(),
	knowledgeState: z.enum(["hidden", "available", "learned", "mastered"]),
	masteryTier: z.enum(["unfamiliar", "learning", "comfortable", "mastered"]),
	masteryLevel: z.number(),
	reliability: z.number(),
	discoveredFrom: z.string().optional(),
	becameAvailableAt: z.number().optional(),
});

const subjectProgress = z.object({
	subject: z.string(),
	year: schoolYear,
	currentLessonOrder: z.number(),
	knowledge: z.number(),
	attendedLessons: z.array(z.string()),
	skippedLessons: z.array(z.string()),
});

const numberRecord = z.record(z.string(), z.number());

const item = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	quantity: z.number(),
});

const relationship = z.object({
	trust: z.number(),
	affection: z.number(),
	respect: z.number(),
	comfort: z.number(),
	attraction: z.number(),
	loyalty: z.number(),
	resentment: z.number(),
	fear: z.number(),
	envy: z.number(),
});

const conversationEntry = z.object({
	topic: z.string().optional(),
	result: z.string(),
	locationId: z.string(),
	turnIndex: z.number(),
	tags: z.array(z.string()),
});

const looseObject = z.object({}).passthrough();

export const SaveFileSchema = z.object({
	metadata: z.object({
		saveVersion: z.literal(SAVE_FORMAT_VERSION),
		createdTimestamp: z.number(),
	}),
	worldClock: z.object({ totalMinutes: z.number() }),
	currentLocationId: z.string(),
	player: z.object({
		name: z.string(),
		gender: z.boolean(),
		age: z.number(),
		appearance: z.string(),
		archetype: z.string(),
		faction: z.string(),
		inventory: z.array(item),
		health: z.number(),
		attributes: z.object({
			values: z.object(
				Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, z.number()])),
			),
		}),
		resources: z.object({
			health: z.number(),
			mana: z.number(),
			energy: z.number(),
			reputation: z.number(),
			injured: z.boolean(),
		}),
	}),
	spellbook: z.record(z.string(), spellState),
	academicState: z.object({
		attributes: numberRecord,
		subjects: z.object(
			Object.fromEntries(SUBJECT_TYPES.map((s) => [s, subjectProgress])),
		),
	}),
	inventory: z.object({ items: z.array(item) }),
	discoveredLocationIds: z.array(z.string()),
	visitedLocationIds: z.array(z.string()),
	questFlags: z.object({
		active: z.array(z.string()),
		completed: z.array(z.string()),
	}),
	flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
	resources: numberRecord,
	relationships: z.record(z.string(), relationship),
	unlockedTopicsByNpc: z.record(z.string(), z.array(z.string())),
	clues: z.record(
		z.string(),
		z.object({ discovered: z.boolean(), sourceNpcId: z.string().optional() }),
	),
	rumors: z.record(
		z.string(),
		z.object({ known: z.boolean(), sourceNpcId: z.string().optional() }),
	),
	sceneInvitations: z.array(
		z.object({
			invitationId: z.string(),
			npcId: z.string(),
			sceneType: z.string(),
			validUntilMinutes: z.number().optional(),
		}),
	),
	conversationHistory: z.record(z.string(), z.array(conversationEntry)),
	knownNPCIds: z.array(z.string()),
	recentEvents: z.array(z.string()),
	output: z.string(),
	settings: z.object({
		narrationMode: z.string(),
		romanceIntensity: z.number(),
	}),
	currentYear: schoolYear,
	campaignBlueprint: looseObject.optional(),
	yearBlueprints: z.record(z.string(), looseObject),
	yearProgress: z.object({
		year: schoolYear,
		completedMilestoneIds: z.array(z.string()),
		moduleStage: numberRecord,
		clueFoundIds: z.array(z.string()),
	}),
});

/** Human-readable problems, e.g. `visitedLocationIds: expected array`. */
export function describeSaveProblems(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const where = issue.path.join(".") || "(save)";
		const missing =
			issue.code === "invalid_type" && String(issue.message).includes("undefined");
		return missing ? `${where} is missing` : `${where}: ${issue.message}`;
	});
}
