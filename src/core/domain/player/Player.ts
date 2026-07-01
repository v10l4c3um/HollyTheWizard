import Item from "../world/Item";
import { AttributeStats, ResourceStats } from "./PlayerStats";

class Player {
	name: string;
	gender: boolean;
	age: number;
	appearance: string;
	archetype: string;
	faction: string;
	inventory: Item[];
	health: number;

	attributes: AttributeStats = new AttributeStats();
	resources: ResourceStats = new ResourceStats();

	constructor() {
		this.name = "Player";
		this.gender = true;
		this.age = 14;
		this.appearance = "default";
		this.archetype = "default";
		this.faction = "default";
		this.inventory = [];
		this.health = 100;
	}
}

export default Player;
