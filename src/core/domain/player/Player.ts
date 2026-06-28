import Item from "../world/Item";
import PlayerStats from "./PlayerStats";

class Player {
	name: string;
	gender: boolean;
	age: number;
	appearance: string;
	archetype: string;
	faction: string;
	inventory: Item[];
	health: number;

	stats: PlayerStats;

	constructor() {
		this.name = "Player";
		this.gender = true;
		this.age = 14;
		this.appearance = "default";
		this.archetype = "default";
		this.faction = "default";
		this.inventory = [];
		this.stats = new PlayerStats();
		this.health = 100;
	}
}

export default Player;
