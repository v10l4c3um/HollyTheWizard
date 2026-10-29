import type Registry from "../../Registry";
import type GameState from "../world/GameState";
import type NPC from "./Npc";
import type { DayOfWeek, TimeOfDay, WeeklyTimetable } from "../quest/Curriculum";
import { activeClass } from "../quest/Timetable";

/** When we are asking: the calendar part of the clock, plus the year's timetable. */
export interface PresenceMoment {
	weekday: DayOfWeek;
	timeOfDay: TimeOfDay;
	timetable?: WeeklyTimetable;
}

/** The moment the game is in right now. */
export function momentOf(state: GameState, registry: Registry): PresenceMoment {
	return {
		weekday: state.worldClock.getWeekday(),
		timeOfDay: state.worldClock.timeOfDay,
		timetable: registry.getTimetable(state.currentYear),
	};
}

/**
 * Where an NPC is at a moment, or `undefined` if they have no schedule.
 * A class they attend or teach wins; then the first matching slot; then home.
 */
export function npcLocation(npc: NPC, moment: PresenceMoment): string | undefined {
	const schedule = npc.schedule;
	if (!schedule) return undefined;

	const lesson = activeClass(moment.timetable, moment.weekday, moment.timeOfDay);
	if (
		lesson?.location &&
		(schedule.attendsClasses ||
			(lesson.subject !== undefined && schedule.teaches?.includes(lesson.subject)))
	) {
		return lesson.location;
	}

	const slot = schedule.slots?.find(
		(candidate) =>
			(!candidate.days || candidate.days.includes(moment.weekday)) &&
			(!candidate.periods || candidate.periods.includes(moment.timeOfDay)),
	);
	return slot?.location ?? schedule.home;
}

/** The NPCs in a place right now (the player's own place by default). */
export function npcsAt(
	registry: Registry,
	state: GameState,
	locationId: string = state.currentLocationId,
): NPC[] {
	const moment = momentOf(state, registry);
	return registry
		.getAllNpcIds()
		.flatMap((id) => {
			const npc = registry.getNPC(id);
			return npc ? [npc] : [];
		})
		.filter((npc) => npcLocation(npc, moment) === locationId);
}
