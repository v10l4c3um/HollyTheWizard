import SpellBook from "../magic/SpellBook";
import NPC from "../npc/Npc";
import Player from "../player/Player";
import Item from "./Item";
import WorldClock from "./WorldClock";
import {
	PlayerAcademicState,
	SubjectType,
	SubjectProgress,
	SchoolYear,
} from "../quest/Curriculum";
import { CampaignBlueprintBase } from "../campaign/CampaignBlueprint";
import {
	YearBlueprint,
	YearProgress,
	createEmptyYearProgress,
} from "../campaign/YearBlueprint";

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
	/** Generic key/value flags set via `FlagSet` effects (see EffectApplier). */
	flags: Record<string, boolean | number | string>;
	/** Generic numeric resources (energy, stress, reputation, ...) mutated via `ResourceDelta` effects. */
	resources: Record<string, number>;
	/** npcId -> axis (trust/affinity/...) -> value, mutated via `RelationshipDelta` effects. */
	relationships: Record<string, Record<string, number>>;
	knownNPCIds: string[];
	recentEvents: string[];
	output: string;

	settings: {
		narrationMode: string;
		romanceIntensity: number;
	};

	currentYear: SchoolYear;
	campaignBlueprint?: CampaignBlueprintBase;
	yearBlueprints: Partial<Record<SchoolYear, YearBlueprint>>;
	yearProgress: YearProgress;

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
		this.flags = {};
		this.resources = {};
		this.relationships = {};
		this.knownNPCIds = [];
		this.recentEvents = [];
		this.output = "";
		this.settings = {
			narrationMode: "default",
			romanceIntensity: 0,
		};

		this.currentYear = 1;
		this.yearBlueprints = {};
		this.yearProgress = createEmptyYearProgress(1);
	}

	private initializeAcademicState(): PlayerAcademicState {
		const subjects: Record<SubjectType, SubjectProgress> = {} as Record<
			SubjectType,
			SubjectProgress
		>;

		const allSubjects: SubjectType[] = [
			"alchemy",
			"ancient-magic",
			"ancient-runes",
			"apparition",
			"arithmancy",
			"astronomy",
			"care-of-magical-creatures",
			"charms",
			"curse-breaking",
			"defense-against-the-dark-arts",
			"divination",
			"enchanting",
			"flying",
			"healing",
			"herbology",
			"history-of-magic",
			"legilimency",
			"magical-architecture",
			"magical-law",
			"magical-theory",
			"magizoology",
			"muggle-studies",
			"occlumency",
			"potions",
			"spell-creation",
			"transfiguration",
			"wandlore",
		];

		for (const subject of allSubjects) {
			subjects[subject] = {
				subject,
				year: 1,
				currentLessonOrder: 1,
				knowledge: 0,
				attendedLessons: [],
				skippedLessons: [],
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
				WIS: 10,
			},
			subjects,
		};
	}

	/**
	 * Rehydrates a GameState from a plain object produced by
	 * `JSON.parse(JSON.stringify(gameState))` (e.g. loaded from disk).
	 * Class-instance fields with methods (`worldClock`, `spellbook`) are
	 * rebuilt via their own `fromJSON`; the rest are plain data and can
	 * be copied directly.
	 */
	static fromPlainObject(data: any): GameState {
		const state = new GameState();

		state.metadata = data.metadata;
		state.currentLocationId = data.currentLocationId;
		state.player = data.player;
		state.academicState = data.academicState;
		state.inventory = data.inventory;
		state.discoveredLocationIds = data.discoveredLocationIds;
		state.questFlags = data.questFlags;
		state.flags = data.flags ?? {};
		state.resources = data.resources ?? {};
		state.relationships = data.relationships ?? {};
		state.knownNPCIds = data.knownNPCIds;
		state.recentEvents = data.recentEvents;
		state.output = data.output;
		state.settings = data.settings;
		state.currentYear = data.currentYear;
		state.campaignBlueprint = data.campaignBlueprint;
		state.yearBlueprints = data.yearBlueprints ?? {};
		state.yearProgress = data.yearProgress;

		state.worldClock = WorldClock.fromJSON(data.worldClock);
		state.spellbook = SpellBook.fromJSON(data.spellbook);

		return state;
	}
}

export default GameState;
