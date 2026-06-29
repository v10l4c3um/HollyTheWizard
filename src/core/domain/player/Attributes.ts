export class AttributesSet {
	attributes: Attribute[] = [];

	addAttribute(name: string, tag: string) {
		this.attributes.push(new Attribute(name, tag));
	}
}

class Attribute {
	name: string;
	tag: string;
	value: number = 0;

	constructor(name: string, tag: string) {
		this.name = name;
		this.tag = tag;
	}

	increaseValue(amount: number) {
		this.value += amount;
	}

	decreaseValue(amount: number) {
		this.value -= amount;
	}
}

export type AttributeId =
	| "INT"
	| "WIL"
	| "DEX"
	| "CHA"
	| "STR"
	| "CON"
	| "PER"
	| "AGI"
	| "LUC"
	| "WIS";

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
