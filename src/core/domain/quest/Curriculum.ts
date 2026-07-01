import { AttributeId } from "../player/PlayerStats";

export type SchoolYear = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DayOfWeek =
	| "monday"
	| "tuesday"
	| "wednesday"
	| "thursday"
	| "friday"
	| "saturday"
	| "sunday";

export type Period = "morning" | "afternoon" | "evening";

export type SubjectType =
	| "alchemy"
	| "ancient-magic"
	| "ancient-runes"
	| "apparition"
	| "arithmancy"
	| "astronomy"
	| "care-of-magical-creatures"
	| "charms"
	| "curse-breaking"
	| "defense-against-the-dark-arts"
	| "divination"
	| "enchanting"
	| "flying"
	| "healing"
	| "herbology"
	| "history-of-magic"
	| "legilimency"
	| "magical-architecture"
	| "magical-law"
	| "magical-theory"
	| "magizoology"
	| "muggle-studies"
	| "occlumency"
	| "potions"
	| "spell-creation"
	| "transfiguration"
	| "wandlore";

export interface SubjectDefinition {
	type: SubjectType;
	name: string;
	description: string;
}

export interface SubjectCurriculum {
	subjectType: SubjectType;
	year: SchoolYear;
	lessons: LessonDefinition[];
}

export interface LessonReward {
	attributes?: AttributeId[];
	subjectKnowledge?: Partial<Record<SubjectType, number>>;
}

export type Requirement =
	| {
			type: "attribute";
			id: AttributeId;
			min: number;
	  }
	| {
			type: "subjectKnowledge";
			subjectId: SubjectType;
			min: number;
	  }
	| {
			type: "year";
			min: SchoolYear;
	  }
	| {
			type: "spellKnown";
			spellId: string;
	  };

export interface SpellRevealOpportunity {
	spellId: string;
	chance: number; // 0-1

	requirements: Requirement[];

	source: "lesson" | "location" | "event" | "npc" | "item";
}

export interface LessonDefinition {
	id: string;

	subjectType: SubjectType;
	year: SchoolYear;

	order: number;
	title: string;

	topic: string;

	// Optional, might be discarded in future
	importance: "routine" | "important" | "exam" | "story";

	rewards: LessonReward;

	revealOpportunities?: SpellRevealOpportunity[];
}

export interface TimetableSlot {
	day: DayOfWeek;
	period: Period;

	type: "class" | "free" | "curfew";

	subject?: SubjectType;
}

export interface WeeklyTimetable {
	year: SchoolYear;
	slots: TimetableSlot[];
}

export interface SubjectProgress {
	subject: SubjectType;
	year: SchoolYear;

	currentLessonOrder: number;
	knowledge: number;

	attendedLessons: string[];
	skippedLessons: string[];
}

export interface GameCalendar {
	year: SchoolYear;
	week: number;
	day: DayOfWeek;
	period: Period;
}

export interface SchoolData {
	subjects: Record<SubjectType, SubjectDefinition>;
	curriculums: SubjectCurriculum[];
	timetables: WeeklyTimetable[];
}

export interface PlayerAcademicState {
	attributes: Record<AttributeId, number>;
	subjects: Record<SubjectType, SubjectProgress>;
}
