import { DAYS_OF_WEEK } from "../quest/Curriculum";
import type { DayOfWeek, TimeOfDay } from "../quest/Curriculum";

const MINUTES_PER_DAY = 1440;
const START_MINUTES = 480; // day 1, 8:00 AM

/**
 * The one clock of the game. Time is counted in minutes since the start of
 * day 1 and never wraps; the day, weekday and time of day are derived from
 * that total, so timestamps taken at different days always compare correctly.
 */
class WorldClock {
	private totalMinutes: number = START_MINUTES;

	get timeOfDay(): TimeOfDay {
		const h = Math.floor(this.getMinutesOfDay() / 60);
		if (h >= 5 && h < 12) return "morning";
		if (h >= 12 && h < 17) return "afternoon";
		if (h >= 17 && h < 21) return "evening";
		return "night";
	}

	advanceTime(minutes: number): void {
		this.totalMinutes += minutes;
	}

	/** Minutes since the start of the game: only ever grows. */
	getTotalMinutes(): number {
		return this.totalMinutes;
	}

	/** Calendar day, starting at 1. */
	getDay(): number {
		return Math.floor(this.totalMinutes / MINUTES_PER_DAY) + 1;
	}

	/** Day 1 is a Monday. */
	getWeekday(): DayOfWeek {
		return DAYS_OF_WEEK[(this.getDay() - 1) % DAYS_OF_WEEK.length];
	}

	/** Minutes since midnight (0–1439). */
	getMinutesOfDay(): number {
		return this.totalMinutes % MINUTES_PER_DAY;
	}

	/** Sets the time of day, staying on the current day. */
	setMinutesOfDay(value: number): void {
		const minutesOfDay =
			((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
		this.totalMinutes =
			(this.getDay() - 1) * MINUTES_PER_DAY + minutesOfDay;
	}

	toJSON(): { totalMinutes: number } {
		return { totalMinutes: this.totalMinutes };
	}

	/** Also reads saves from before the calendar, which only kept `minutesOfDay`. */
	static fromJSON(
		data: { totalMinutes: number } | { minutesOfDay: number },
	): WorldClock {
		const clock = new WorldClock();
		if ("totalMinutes" in data) {
			clock.totalMinutes = data.totalMinutes;
		} else {
			clock.setMinutesOfDay(data.minutesOfDay);
		}
		return clock;
	}

	getCurrentTime(): string {
		const minutesOfDay = this.getMinutesOfDay();
		const h = Math.floor(minutesOfDay / 60);
		const m = minutesOfDay % 60;
		const ampm = h >= 12 ? "PM" : "AM";
		const display_h = h === 0 ? 12 : h > 12 ? h - 12 : h;
		return `${display_h}:${String(m).padStart(2, "0")} ${ampm}`;
	}
}

export default WorldClock;
