import { SpellState, SpellKnowledgeState } from "./Spell";

class SpellBook {
	private spells: Map<string, SpellState>;

	constructor() {
		this.spells = new Map();
	}

	getSpellState(spellId: string): SpellState | undefined {
		return this.spells.get(spellId);
	}

	setSpellState(spellId: string, state: SpellState): void {
		this.spells.set(spellId, state);
	}

	updateSpellState(spellId: string, updates: Partial<SpellState>): void {
		const current = this.spells.get(spellId);
		if (current) {
			this.spells.set(spellId, { ...current, ...updates });
		}
	}

	getSpellsByKnowledgeState(state: SpellKnowledgeState): SpellState[] {
		return Array.from(this.spells.values()).filter(
			(spell) => spell.knowledgeState === state,
		);
	}

	hasLearnedSpell(spellId: string): boolean {
		const state = this.spells.get(spellId);
		return state?.knowledgeState === "learned" || state?.knowledgeState === "mastered";
	}

	getAllSpells(): SpellState[] {
		return Array.from(this.spells.values());
	}
}

export default SpellBook;
