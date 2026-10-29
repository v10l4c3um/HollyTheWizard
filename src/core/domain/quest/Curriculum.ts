import { AttributeId } from "../player/PlayerStats";
import type {
	LessonDefinition,
	LessonReward,
	Requirement,
	SpellRevealOpportunity,
	SubjectCurriculum,
	SubjectDefinition,
	TimetableSlot,
	WeeklyTimetable,
} from "./CurriculumContent";

/** What a content pack may say about school life; the schemas live in `CurriculumContent.ts`. */
export type {
	LessonDefinition,
	LessonReward,
	Requirement,
	SpellRevealOpportunity,
	SubjectCurriculum,
	SubjectDefinition,
	TimetableSlot,
	WeeklyTimetable,
};

export const SCHOOL_YEARS = [1, 2, 3, 4, 5, 6, 7] as const;

export type SchoolYear = (typeof SCHOOL_YEARS)[number];

export const DAYS_OF_WEEK = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const PERIODS = ["morning", "afternoon", "evening"] as const;

export type Period = (typeof PERIODS)[number];

/** The clock's four parts of the day: the timetable's periods plus the hours no class is held. */
export const TIMES_OF_DAY = [...PERIODS, "night"] as const;

export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Every subject the game knows how to track. */
export const SUBJECT_TYPES = [
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
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

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
