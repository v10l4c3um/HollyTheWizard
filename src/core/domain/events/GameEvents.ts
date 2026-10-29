import {
	SubjectType,
	SchoolYear,
	DayOfWeek,
	TimeOfDay,
} from "../quest/Curriculum";
import { AttributeId } from "../player/PlayerStats";
import type { Logger } from "../../application/ports/Logger";
import { TypedBus } from "../../engine/EventBus";
import type { InWorldCommand } from "../commands/CommandDefinitions";
import type { SpellLearnSource } from "../effects/GameEffects";
import type { ConversationResult } from "../npc/ConversationTypes";
import type { TopicCategory } from "../npc/TopicRegistry";
import type { FlagId, LessonId, LocationId, NpcId, SpellId, TopicId } from "../ids";

/**
 * How an action turned out: `success`; `blocked` (tried, did not work, time
 * passed, e.g. a move to a place that is not connected); `failure` (not a valid
 * request, nothing happened).
 */
export type ActionOutcome = "success" | "blocked" | "failure";

/** Where a spell first became known of. */
export type SpellRevealSource = "study" | "class" | "location" | "event" | "npc" | "item";

export type GameEvents = {
	SpellRevealed: {
		spellId: SpellId;
		source: SpellRevealSource;
	};
	SpellLearned: { spellId: SpellId; source: SpellLearnSource };
	SpellMastered: { spellId: SpellId };
	SpellPracticed: {
		spellId: SpellId;
		attempts: number;
		successCount: number;
		proficiency: number;
	};
	LessonAttended: {
		subjectId: SubjectType;
		lessonId: LessonId;
		lessonTitle: string;
	};
	LessonSkipped: { subjectId: SubjectType; lessonId: LessonId };
	/**
	 * Cause event only: carries what happened, not resulting totals. Totals
	 * live in `GameState` and are mutated via the `ProgressDelta` effect
	 * (see docs/event-effect-conversion-plan.md, Steps 4B/7).
	 */
	SubjectStudied: {
		subjectId: SubjectType;
		knowledgeGain: number;
	};
	/**
	 * @deprecated Prefer the `AttributeDelta` effect (applied via
	 * `applyEffects`). Kept for now in case other listeners still rely on it.
	 */
	AttributeGained: {
		attributeId: AttributeId;
		delta: number;
		newValue: number;
	};
	/**
	 * Generic hook emitted for every resolved command
	 * (docs/event-effect-conversion-plan.md, Step 6). Lets cross-cutting
	 * systems (rumors, suspicion, analytics, achievements, ...) react to any
	 * action without the resolver having to know about them.
	 */
	ActionResolved: {
		actionType: InWorldCommand["type"];
		locationId: LocationId;
		outcome: ActionOutcome;
		tags?: string[];
	};
	LocationVisited: { locationId: LocationId; isFirstVisit: boolean };
	LocationDiscovered: { locationId: LocationId };
	NpcTalkedTo: { npcId: NpcId; topic: TopicId | undefined };
	ConversationResolved: {
		npcId: NpcId;
		topic: TopicId | undefined;
		result: ConversationResult;
		narrationTags: string[];
		score: number;
	};
	TopicDiscussed: {
		npcId: NpcId;
		topicId: TopicId;
		category: TopicCategory;
	};
	BoundaryHit: {
		npcId: NpcId;
		topicId: TopicId;
	};
	RevealTriggered: {
		npcId: NpcId;
		topicId: TopicId;
	};
	QuestFlagSet: { flagId: FlagId; active: boolean };
	QuestActivated: { questId: string };
	QuestCompleted: { questId: string };
	/** A new part of the day began (once per boundary, even across a long rest). */
	PeriodChanged: {
		day: number;
		weekday: DayOfWeek;
		period: TimeOfDay;
		atMinutes: number;
	};
	/** A new calendar day began, at midnight. */
	DayStarted: { day: number; weekday: DayOfWeek };
	TimeAdvanced: {
		minutesDelta: number;
		newMinutesOfDay: number;
		/** Minutes since the start of the game. */
		totalMinutes: number;
	};
	GameSaved: { filename: string };
	GameLoaded: { filename: string };
	YearAdvanced: { fromYear: SchoolYear; toYear: SchoolYear };
	BlueprintGenerated: {
		scope: "campaign" | "year";
		year?: SchoolYear;
		wasFallback: boolean;
	};
	BlueprintMilestoneReached: {
		year: SchoolYear;
		milestoneId: string;
		description: string;
	};
};

export type GameBus = TypedBus<GameEvents>;

export function createGameBus(logger?: Logger): GameBus {
	return new TypedBus<GameEvents>(logger);
}

/** One bus event, named and with its payload: what a rule asks to have announced. */
export type EmittedEvent = {
	[K in keyof GameEvents]: { name: K; payload: GameEvents[K] };
}[keyof GameEvents];

/** Builds an `EmittedEvent` with the payload checked against the event's name. */
export function event<K extends keyof GameEvents>(
	name: K,
	payload: GameEvents[K],
): EmittedEvent {
	return { name, payload } as EmittedEvent;
}
