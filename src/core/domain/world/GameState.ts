import SpellBook from "../magic/SpellBook";
import NPC from "../npc/Npc";
import Player from "../player/Player";
import Item from "./Item";
import WorldClock from "./WorldClock";

class GameState {
	metadata: {
		saveVersion: string;
		createdTimestamp: number;
	};
	worldClock: WorldClock;
	currentLocationId: string;
	player: Player;
	spellbook: SpellBook;
	inventory: {
		items: Item[];
	};
	discoveredLocationIds: string[];
	questFlags: {
		active: string[];
		completed: string[];
	};
	knownNPCIds: string[];
	recentEvents: string[];
	output: string;

	settings: {
		narrationMode: string;
		romanceIntensity: number;
	};

	constructor() {
		this.metadata = {
			saveVersion: "0.0.1",
			createdTimestamp: Date.now(),
		};
		this.worldClock = new WorldClock();
		this.currentLocationId = "startingVillage";
		this.player = new Player();
		this.spellbook = new SpellBook();
		this.inventory = {
			items: [],
		};
		this.discoveredLocationIds = [];
		this.questFlags = {
			active: [],
			completed: [],
		};
		this.knownNPCIds = [];
		this.recentEvents = [];
		this.output = "";
		this.settings = {
			narrationMode: "default",
			romanceIntensity: 0,
		};
	}
}

export default GameState;
