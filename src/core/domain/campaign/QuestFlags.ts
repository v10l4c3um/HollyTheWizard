import { GameEffect, questFlagSet } from "../effects/GameEffects";
import { GameEvents } from "../events/GameEvents";

/**
 * Which bus events mark story progress, and the flag each one sets. The flags
 * are what `BlueprintProgressService` checks to complete milestones, so these
 * strings are the contract with the blueprints.
 */
export type QuestFlagEventName =
	| "LessonAttended"
	| "LocationDiscovered"
	| "SpellRevealed"
	| "SpellMastered";

export type QuestFlagEvents = {
	[K in QuestFlagEventName]: (
		payload: GameEvents[K],
	) => GameEffect[];
};

export const QUEST_FLAG_EVENTS: QuestFlagEvents = {
	LessonAttended: ({ subjectId, lessonId }) => [
		questFlagSet("active", `lesson_completed:${subjectId}:${lessonId}`),
	],
	LocationDiscovered: ({ locationId }) => [questFlagSet("active", `discovered:${locationId}`)],
	SpellRevealed: ({ spellId }) => [questFlagSet("active", `spell_revealed:${spellId}`)],
	SpellMastered: ({ spellId }) => [questFlagSet("completed", `mastered:${spellId}`)],
};
