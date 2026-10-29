import { z } from "zod";

/**
 * The shape of a spell in a content pack. The schemas are the single source:
 * the types below are inferred from them, so what a pack may contain and what
 * the game reads cannot drift apart. Objects are strict, so a misspelled key
 * is an error instead of being silently ignored.
 */

const ConditionSchema = z.strictObject({
	type: z.enum(["quest", "attribute", "item", "location"]),
	value: z.union([z.string(), z.number()]),
	/** e.g. "found in a book", "taught by a professor". */
	source: z.string().optional(),
});

export const SpellDefinitionSchema = z.strictObject({
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
});

export const SpellBalanceSchema = z.strictObject({
	manaCost: z.number().min(0),
	backfireRisk: z.enum(["none", "low", "medium", "high"]),
	/** 0 to 1. */
	learningDifficulty: z.number().min(0).max(1),
	practiceRequirement: z.number().positive(),
	scaling: z.record(z.string(), z.number()),
});

export const SpellSchema = z.strictObject({
	definition: SpellDefinitionSchema,
	balance: SpellBalanceSchema,
});

export type SpellDefinition = z.infer<typeof SpellDefinitionSchema>;
export type SpellBalance = z.infer<typeof SpellBalanceSchema>;
export type Spell = z.infer<typeof SpellSchema>;

export type SpellKnowledgeState =
	| "hidden" // player is not ready
	| "available" // prerequisites met, but not encountered
	| "learned" // encountered and understood
	| "mastered"; // high proficiency

export type SpellMasteryTier =
	| "unfamiliar" // debuff
	| "learning" // neutral
	| "comfortable" // easier
	| "mastered"; // cheap

/*
Mastery 20: cast reliably outside combat
Mastery 50: cast reliably in combat
Mastery 75: reduced mana cost
Mastery 90: ???
*/

export interface SpellState {
	spellId: string;

	// Core progression
	proficiency: number; // 0–100
	practicePoints: number;

	// Stabilization tracking
	stability: number; // how "reliable" the spell feels (0–1)

	knowledgeState: SpellKnowledgeState;

	masteryTier: SpellMasteryTier;
	masteryLevel: number; // 0-100
	reliability: number; // 0-100

	// Discovery tracking
	discoveredFrom?: string;
	becameAvailableAt?: number;
}

