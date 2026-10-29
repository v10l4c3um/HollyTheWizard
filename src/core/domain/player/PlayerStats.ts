export const ATTRIBUTE_IDS = [
	"INT",
	"WIL",
	"DEX",
	"CHA",
	"STR",
	"CON",
	"PER",
	"AGI",
	"LUC",
	"WIS",
] as const;

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

export type AttributeStatsDelta = Partial<Record<AttributeId, number>>;

export class AttributeStats {
	private values: Record<AttributeId, number> = {
		INT: 0,
		WIL: 0,
		DEX: 0,
		CHA: 0,
		STR: 0,
		CON: 0,
		PER: 0,
		AGI: 0,
		LUC: 0,
		WIS: 0,
	};

	get(id: AttributeId): number {
		return this.values[id];
	}

	set(id: AttributeId, value: number): void {
		this.values[id] = value;
	}

	increase(id: AttributeId, amount: number): void {
		this.values[id] += amount;
	}

	decrease(id: AttributeId, amount: number): void {
		this.values[id] -= amount;
	}

	applyDelta(delta: AttributeStatsDelta): void {
		for (const id of Object.keys(delta) as AttributeId[]) {
			this.values[id] += delta[id] ?? 0;
		}
	}

	getAll(): Record<AttributeId, number> {
		return { ...this.values };
	}

	/**
	 * Rebuilds from `JSON.parse(JSON.stringify(stats))`. The private `values`
	 * field is what gets serialized, so the saved shape is `{ values: {...} }`.
	 * Attributes missing from the data keep their defaults.
	 */
	static fromJSON(data?: { values?: Partial<Record<AttributeId, number>> }) {
		const stats = new AttributeStats();
		Object.assign(stats.values, data?.values);
		return stats;
	}
}

/*
Intellect - INT
Willpower - WIL
Dexterity - DEX
Charisma - CHA
Strength - STR
Constitution - CON
Perception - PER
Agility - AGI
Luck - LUC
Wisdom - WIS
*/

export type ResourceStatId = "health" | "mana" | "energy" | "reputation";

export type ResourceStatsDelta = Partial<Record<ResourceStatId, number>> & {
	injured?: boolean;
};

export class ResourceStats {
	health = 100;
	mana = 100;
	energy = 100;
	reputation = 0;
	injured = false;

	applyDelta(delta: ResourceStatsDelta): void {
		for (const key of ["health", "mana", "energy", "reputation"] as const) {
			if (delta[key] !== undefined) {
				this[key] += delta[key]!;
			}
		}

		if (delta.injured !== undefined) {
			this.injured = delta.injured;
		}
	}

	clone(): ResourceStats {
		return Object.assign(new ResourceStats(), this);
	}

	/** Rebuilds from `JSON.parse(JSON.stringify(stats))`; missing fields keep defaults. */
	static fromJSON(data?: Partial<ResourceStats>): ResourceStats {
		return Object.assign(new ResourceStats(), data);
	}
}
