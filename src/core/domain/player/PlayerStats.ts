class PlayerStats {
	character: {
		intelligence: number;
		strength: number;
		agility: number;
		charisma: number;
		dexterity: number;
		wisdom: number;
	};

	resources: {
		health: number;
		mana: number;
		stamina: number;
		injured: boolean;
	};

	constructor() {
		this.character = {
			intelligence: 10,
			strength: 10,
			agility: 10,
			charisma: 10,
			dexterity: 10,
			wisdom: 10,
		};
		this.resources = {
			health: 100,
			mana: 100,
			stamina: 100,
			injured: false,
		};
	}
}

export default PlayerStats;
