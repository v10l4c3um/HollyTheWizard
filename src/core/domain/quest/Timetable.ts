import type {
	DayOfWeek,
	TimeOfDay,
	TimetableSlot,
	WeeklyTimetable,
} from "./Curriculum";

/** The class being held at this moment, if any. Nothing is held at night. */
export function activeClass(
	timetable: WeeklyTimetable | undefined,
	weekday: DayOfWeek,
	timeOfDay: TimeOfDay,
): TimetableSlot | undefined {
	return timetable?.slots.find(
		(slot) =>
			slot.type === "class" && slot.day === weekday && slot.period === timeOfDay,
	);
}
