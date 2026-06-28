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

	proficiency: number; // 0–1 or 0–100
	successCount: number;
	failureCount: number;

	lastUsed?: number;

	unlocked: boolean;
}

export interface Spell {
	definition: SpellDefinition;
	balance: SpellBalance;
	state?: SpellState;
}
