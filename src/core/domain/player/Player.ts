import Item from "../world/Item";
import PlayerStats from "./PlayerStats";

class Player {
	name: string;
	gender: boolean; // true for male
	age: number;
	appearance: string;
	archetype: string;
	faction: string;
	inventory: Item[];

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
	}
}

export default Player;
