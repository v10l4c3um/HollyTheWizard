import { AttributesSet } from "../player/Attributes";

export interface SpellDefinition {
	id: string;
	name: string;
	description: string;

	level: "unknown" | "novice" | "apprentice" | "advanced" | "expert";

	usageType: "combat" | "utility" | "passive";

	range: "self" | "touch" | "short" | "ranged";
	targetType: "self" | "single" | "group" | "area" | "passive";

	revealCondition?: RequiredCondition;
	castCondition?: RequiredCondition;

	visuals?: string;
	sound?: string;
	loreTag?: string;
}

interface RequiredCondition {
	type: "quest" | "attribute" | "item" | "location";
	value: string | number;
	source?: string; // e.g., "found in a book", "taught by a professor", etc.
}

type SpellKnowledgeState =
	| "hidden" // player is not ready
	| "available" // prerequisites met, but not encountered
	| "learned" // encountered and understood
	| "mastered"; // high proficiency

type SpellMasteryTier =
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

export interface SpellBalance {
	manaCost: number;

	backfireRisk: "none" | "low" | "medium" | "high";

	learningDifficulty: number; // 0–1
	practiceRequirement: number;

	scaling: Record<string, number>;
}

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
}

export interface Spell {
	definition: SpellDefinition;
	balance: SpellBalance;
	state?: SpellState;
}
