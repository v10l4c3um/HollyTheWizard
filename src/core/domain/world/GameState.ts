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
	SUBJECT_TYPES,
} from "../quest/Curriculum";
import { CampaignBlueprintBase } from "../campaign/CampaignBlueprint";
import {
	YearBlueprint,
	YearProgress,
	createEmptyYearProgress,
} from "../campaign/YearBlueprint";
import { RelationshipStats } from "../npc/Relationship";
import { ConversationMemoryEntry } from "../npc/ConversationTypes";

/** Where a new game starts. Content is checked to contain this location. */
export const START_LOCATION_ID = "great_hall";

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
	relationships: Record<string, RelationshipStats>;
	/** npcId -> list of unlocked topic ids, mutated via `TopicUnlocked` effects. */
	unlockedTopicsByNpc: Record<string, string[]>;
	/** clueId -> discovery record, mutated via `ClueRevealed` effects. */
	clues: Record<string, { discovered: boolean; sourceNpcId?: string }>;
	/** rumorId -> known record, mutated via `RumorLearned` effects. */
	rumors: Record<string, { known: boolean; sourceNpcId?: string }>;
	/** Pending scene invitations, mutated via `SceneInvitationCreated` effects. */
	sceneInvitations: Array<{
		invitationId: string;
		npcId: string;
		sceneType: string;
		validUntilMinutes?: number;
	}>;
	/** npcId → last-20 conversation entries, mutated via `ConversationMemoryRecorded` effects. */
	conversationHistory: Record<string, ConversationMemoryEntry[]>;
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
		this.currentLocationId = START_LOCATION_ID;
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
		this.unlockedTopicsByNpc = {};
		this.clues = {};
		this.rumors = {};
		this.sceneInvitations = [];
		this.conversationHistory = {};
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

		for (const subject of SUBJECT_TYPES) {
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
		state.player = Player.fromJSON(data.player);
		state.academicState = data.academicState;
		state.inventory = data.inventory;
		state.discoveredLocationIds = data.discoveredLocationIds;
		state.questFlags = data.questFlags;
		state.flags = data.flags ?? {};
		state.resources = data.resources ?? {};
		state.relationships = Object.fromEntries(
			Object.entries(data.relationships ?? {}).map(([npcId, stats]) => [
				npcId,
				RelationshipStats.fromJSON(stats as Partial<RelationshipStats>),
			]),
		);
		state.unlockedTopicsByNpc = data.unlockedTopicsByNpc ?? {};
		state.clues = data.clues ?? {};
		state.rumors = data.rumors ?? {};
		state.sceneInvitations = data.sceneInvitations ?? [];
		state.conversationHistory = data.conversationHistory ?? {};
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
