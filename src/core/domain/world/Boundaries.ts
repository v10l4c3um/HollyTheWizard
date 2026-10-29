import { DAYS_OF_WEEK, DayOfWeek, TimeOfDay } from "../quest/Curriculum";

const MINUTES_PER_DAY = 1440;

/** Where each part of the day starts, in minutes after midnight (see `WorldClock.timeOfDay`). */
const PERIOD_STARTS: { atMinutesOfDay: number; period: TimeOfDay }[] = [
	{ atMinutesOfDay: 5 * 60, period: "morning" },
	{ atMinutesOfDay: 12 * 60, period: "afternoon" },
	{ atMinutesOfDay: 17 * 60, period: "evening" },
	{ atMinutesOfDay: 21 * 60, period: "night" },
];

const PREVIOUS_PERIOD: Record<TimeOfDay, TimeOfDay> = {
	morning: "night",
	afternoon: "morning",
	evening: "afternoon",
	night: "evening",
};

/** A moment the world passes a line: a new part of the day, or a new calendar day. */
export interface Boundary {
	/** Total minutes since the start of the game (the clock's reference). */
	atMinutes: number;
	kind: "period" | "day";
	/** Calendar day (from 1) that starts or contains this boundary. */
	day: number;
	weekday: DayOfWeek;
	/** The part of the day in effect right after the boundary. */
	period: TimeOfDay;
	/** For a `period` boundary, the part of the day that just ended. */
	endedPeriod?: TimeOfDay;
}

/**
 * Every boundary in `(fromTotal, toTotal]`, oldest first. A day boundary is
 * at midnight; the part of the day does not change then (night goes on).
 * Empty when no time passed.
 */
export function boundariesBetween(
	fromTotal: number,
	toTotal: number,
): Boundary[] {
	const boundaries: Boundary[] = [];
	if (toTotal <= fromTotal) return boundaries;

	const firstDay = Math.floor(fromTotal / MINUTES_PER_DAY);
	const lastDay = Math.floor(toTotal / MINUTES_PER_DAY);

	for (let dayIndex = firstDay; dayIndex <= lastDay; dayIndex++) {
		const midnight = dayIndex * MINUTES_PER_DAY;
		const day = dayIndex + 1;
		const weekday = DAYS_OF_WEEK[dayIndex % DAYS_OF_WEEK.length];
		const candidates: Boundary[] = [
			{ atMinutes: midnight, kind: "day", day, weekday, period: "night" },
			...PERIOD_STARTS.map(({ atMinutesOfDay, period }) => ({
				atMinutes: midnight + atMinutesOfDay,
				kind: "period" as const,
				day,
				weekday,
				period,
				endedPeriod: PREVIOUS_PERIOD[period],
			})),
		];
		for (const boundary of candidates) {
			if (boundary.atMinutes > fromTotal && boundary.atMinutes <= toTotal) {
				boundaries.push(boundary);
			}
		}
	}

	return boundaries;
}
