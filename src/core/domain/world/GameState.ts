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
	currentLocation: WebGLUniformLocation;
	player: Player;
	spellbook: SpellBook;
	inventory: {
		items: Item[];
	};
	discoveredLocations: Location[];
	questFlags: {
		active: string[];
		completed: string[];
	};
	knownNPCs: NPC[];
	// TODO: Figure out how to represent recent events or action history in a way that is useful for the game logic and narrative
	recentEvents: string[];

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
		this.currentLocation = "startingVillage";
		this.player = new Player();
		this.spellbook = new SpellBook();
		this.inventory = {
			items: [],
		};
		this.discoveredLocations = [];
		this.questFlags = {
			active: [],
			completed: [],
		};
		this.knownNPCs = [];
		this.recentEvents = [];
		this.settings = {
			narrationMode: "default",
			romanceIntensity: 0,
		};
	}
}
