interface Spell {
	name: string;
	description: string;
	manaCost: number;
	level: number;
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
