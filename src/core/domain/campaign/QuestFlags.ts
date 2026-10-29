import { GameEffect, questFlagSet } from "../effects/GameEffects";
import { GameEvents } from "../events/GameEvents";
import type Registry from "../../Registry";

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

/** The names of the flags the game sets. These strings are the contract with the blueprints. */
export const lessonCompletedFlag = (subjectId: string, lessonId: string) =>
	`lesson_completed:${subjectId}:${lessonId}`;
export const discoveredFlag = (locationId: string) => `discovered:${locationId}`;
export const spellRevealedFlag = (spellId: string) => `spell_revealed:${spellId}`;
export const masteredFlag = (spellId: string) => `mastered:${spellId}`;

export const QUEST_FLAG_EVENTS: QuestFlagEvents = {
	LessonAttended: ({ subjectId, lessonId }) => [
		questFlagSet("active", lessonCompletedFlag(subjectId, lessonId)),
	],
	LocationDiscovered: ({ locationId }) => [questFlagSet("active", discoveredFlag(locationId))],
	SpellRevealed: ({ spellId }) => [questFlagSet("active", spellRevealedFlag(spellId))],
	SpellMastered: ({ spellId }) => [questFlagSet("completed", masteredFlag(spellId))],
};

/**
 * Every flag the game can really set, built from the content: a lesson that
 * can be attended, a place that can be discovered, a spell that can be
 * revealed or mastered. A blueprint may only ask for these, or its milestone
 * could never be reached.
 */
export function questFlagAllowlist(registry: Registry): string[] {
	const flags: string[] = [];
	for (const curriculum of registry.getSchoolData()?.curriculums ?? []) {
		for (const lesson of curriculum.lessons) {
			flags.push(lessonCompletedFlag(lesson.subjectType, lesson.id));
		}
	}
	for (const id of registry.getAllLocationIds()) flags.push(discoveredFlag(id));
	for (const id of registry.getAllSpellIds()) {
		flags.push(spellRevealedFlag(id), masteredFlag(id));
	}
	return flags;
}
