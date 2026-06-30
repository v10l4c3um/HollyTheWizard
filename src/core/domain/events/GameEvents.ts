import { SubjectType, SchoolYear } from "../quest/Curriculum";
import { AttributeId } from "../player/Attributes";
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
	SubjectStudied: {
		subjectId: SubjectType;
		knowledgeGain: number;
		totalKnowledge: number;
	};
	AttributeGained: {
		attributeId: AttributeId;
		delta: number;
		newValue: number;
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
