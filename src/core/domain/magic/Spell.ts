export interface SpellDefinition {
	id: string;
	name: string;
	description: string;

	level: "unknown" | "novice" | "apprentice" | "advanced" | "expert";

	usageType: "combat" | "utility" | "passive";

	range: "self" | "touch" | "short" | "ranged";
	targetType: "self" | "single" | "group" | "area" | "passive";

	requiredConditions: RequiredCondition[];

	visuals?: string;
	sound?: string;
	loreTag?: string;
}

interface RequiredCondition {
	type: "class" | "attribute" | "environment";
	value: string | number;
}

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

	successCount: number;
	totalUses: number;

	// Optional flavor for narration hooks
	masteryTier: "unfamiliar" | "learning" | "comfortable" | "mastered";
}

export interface Spell {
	definition: SpellDefinition;
	balance: SpellBalance;
	state?: SpellState;
}
