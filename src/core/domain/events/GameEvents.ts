import { SubjectType, SchoolYear } from "../quest/Curriculum";
import { AttributeId } from "../player/PlayerStats";
import { TypedBus } from "../../engine/EventBus";

export type GameEvents = {
	SpellRevealed: {
		spellId: string;
		source: "study" | "class" | "location" | "event" | "npc" | "item";
	};
	SpellLearned: { spellId: string; source: string };
	SpellMastered: { spellId: string };
	SpellPracticed: {
		spellId: string;
		attempts: number;
		successCount: number;
		proficiency: number;
	};
	LessonAttended: {
		subjectId: SubjectType;
		lessonId: string;
		lessonTitle: string;
	};
	LessonSkipped: { subjectId: SubjectType; lessonId: string };
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
		actionType: string;
		locationId: string;
		outcome: "success" | "failure";
		tags?: string[];
	};
	LocationVisited: { locationId: string; isFirstVisit: boolean };
	LocationDiscovered: { locationId: string };
	NpcTalkedTo: { npcId: string; topic: string | undefined };
	QuestFlagSet: { flagId: string; active: boolean };
	QuestActivated: { questId: string };
	QuestCompleted: { questId: string };
	TimeAdvanced: { minutesDelta: number; newMinutesOfDay: number };
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

export function createGameBus(): GameBus {
	return new TypedBus<GameEvents>();
}
