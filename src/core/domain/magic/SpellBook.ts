import { Spell } from "./Spell";

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
