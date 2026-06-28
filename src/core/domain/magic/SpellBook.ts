export interface Spell {
	id: string;
	name: string;
	description: string;
	manaCost: number;
	level: SpellLevel;
	requiredConditions: RequiredCondition[];
	usageType: "combat" | "utility" | "passive";

	learningDifficulty: number; // 0–1 (how hard to learn)
	practiceRequirement: number; // number of successful uses to improve proficiency

	range: "self" | "touch" | "short" | "ranged";
	targetType: "self" | "single" | "group" | "area" | "passive";

	backfireRisk: "none" | "low" | "medium" | "high"; // The risk of the spell backfiring, which could cause negative effects on the caster or allies
	scaling: {
		[attribute: string]: number; // A mapping of attribute names to scaling factors, which determine how the spell's effectiveness is influenced by the caster's attributes
	};

	visuals?: string; // what it looks like
	sound?: string;
	loreTag?: string; // e.g. "ancient_fire_magic", "nature_binding"
}

interface RequiredCondition {
	type: "class" | "attribute" | "environment";
	value: string | number;
}

enum SpellLevel {
	Unknown = 0,
	Novice = 1,
	Apprentice = 2,
	Adept = 3,
	Expert = 4,
}

class SpellBook {
	spells: Spell[];

	constructor() {
		this.spells = [];
	}

	addSpell(spell: Spell): void {
		this.spells.push(spell);
	}
}

export default SpellBook;
