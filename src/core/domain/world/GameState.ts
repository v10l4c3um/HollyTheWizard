import SpellBook from "../magic/SpellBook";
import NPC from "../npc/Npc";
import Player from "../player/Player";
import Item from "./Item";
import WorldClock from "./WorldClock";
import { PlayerAcademicState, SubjectType, SubjectProgress } from "../quest/Curriculum";

class GameState {
	metadata: {
		saveVersion: string;
		createdTimestamp: number;
	};
	worldClock: WorldClock;
	currentLocationId: string;
	player: Player;
	spellbook: SpellBook;
	academicState: PlayerAcademicState;
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
		this.academicState = this.initializeAcademicState();
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

	private initializeAcademicState(): PlayerAcademicState {
		const subjects: Record<SubjectType, SubjectProgress> = {} as Record<SubjectType, SubjectProgress>;

		const allSubjects: SubjectType[] = [
			"alchemy", "ancient-magic", "ancient-runes", "apparition", "arithmancy",
			"astronomy", "care-of-magical-creatures", "charms", "curse-breaking",
			"defense-against-the-dark-arts", "divination", "enchanting", "flying",
			"healing", "herbology", "history-of-magic", "legilimency",
			"magical-architecture", "magical-law", "magical-theory", "magizoology",
			"muggle-studies", "occlumency", "potions", "spell-creation",
			"transfiguration", "wandlore"
		];

		for (const subject of allSubjects) {
			subjects[subject] = {
				subject,
				year: 1,
				currentLessonOrder: 1,
				knowledge: 0,
				attendedLessons: [],
				skippedLessons: []
			};
		}

		return {
			attributes: {
				INT: 10,
				WIL: 10,
				DEX: 10,
				CHA: 10,
				STR: 10,
				CON: 10,
				PER: 10,
				AGI: 10,
				LUC: 10,
				WIS: 10
			},
			subjects
		};
	}
}

export default GameState;
