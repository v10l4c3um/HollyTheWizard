import { TimeCost } from "./TimeCost";
import { SubjectType } from "../domain/quest/Curriculum";
import { AttributeId } from "../domain/player/Attributes";

export interface TurnResult {
	briefOutput: string;
	events: string[];
	timeCost: TimeCost;
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
