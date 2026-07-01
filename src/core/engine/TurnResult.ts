import { TimeCost } from "./TimeCost";
import { SubjectType } from "../domain/quest/Curriculum";
import { AttributeId } from "../domain/player/Attributes";
import { GameEffect } from "../domain/effects/GameEffects";

export interface TurnResult {
	briefOutput: string;
	events: string[];
	timeCost: TimeCost;
	/**
	 * Effects already applied to `GameState` this turn (via `applyEffects`),
	 * surfaced so the renderer can eventually show an "effects summary"
	 * alongside the narrated outcome (docs/event-effect-conversion-plan.md,
	 * Step 10).
	 */
	effects?: GameEffect[];
	stateChanges: {
		currentLocationId?: string;
		newDiscoveredLocationId?: string;
		subjectKnowledgeGains?: Partial<Record<SubjectType, number>>;
		attributeGains?: Partial<Record<AttributeId, number>>;
		spellsRevealed?: string[];
		spellsLearned?: string[];
		lessonCompleted?: { subject: SubjectType; lessonId: string };
	};
}
