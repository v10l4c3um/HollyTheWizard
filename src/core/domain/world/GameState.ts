import SpellBook from "../magic/SpellBook";
import NPC from "../npc/Npc";
import Player from "../player/Player";
import Item from "./Item";
import WorldClock from "./WorldClock";
import Location from "./Location";

class GameState {
	metadata: {
		saveVersion: string;
		createdTimestamp: number;
	};
	worldClock: WorldClock;
	currentLocation: Location;
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
		this.currentLocation = new Location();
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
		this.output = "";
		this.settings = {
			narrationMode: "default",
			romanceIntensity: 0,
		};
	}
}

export default GameState;
