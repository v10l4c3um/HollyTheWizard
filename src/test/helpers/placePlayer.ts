import GameState from "../../core/domain/world/GameState";
import Registry from "../../core/Registry";
import { DayOfWeek, Period } from "../../core/domain/quest/Curriculum";
import { activeClass } from "../../core/domain/quest/Timetable";
import { momentOf, npcLocation } from "../../core/domain/npc/Presence";

/**
 * Helpers for tests that call the turn rules directly: the world has a
 * schedule now, so they must put the player where and when an action is valid.
 */

const STEP_MINUTES = 60;
const LIMIT_STEPS = 24 * 14; // two weeks

/** Moves the clock forward (never back) to the first moment that is `weekday` and `period`. */
export function waitUntil(state: GameState, weekday: DayOfWeek, period: Period): void {
	for (let i = 0; i < LIMIT_STEPS; i++) {
		if (state.worldClock.getWeekday() === weekday && state.worldClock.timeOfDay === period) {
			return;
		}
		state.worldClock.advanceTime(STEP_MINUTES);
	}
	throw new Error(`never reached ${weekday} ${period}`);
}

/**
 * Moves the clock to the next time `subject` is taught and the player to its
 * room. With `next: true` the slot the clock is in now is skipped.
 */
export function moveToClass(
	state: GameState,
	registry: Registry,
	subject: string,
	options: { next?: boolean } = {},
): void {
	const timetable = registry.getTimetable(state.currentYear);
	const keyNow = slotKey(state);
	for (let i = 0; i < LIMIT_STEPS; i++) {
		if (options.next || i > 0) state.worldClock.advanceTime(STEP_MINUTES);
		const slot = activeClass(
			timetable,
			state.worldClock.getWeekday(),
			state.worldClock.timeOfDay,
		);
		const isNewSlot = !options.next || slotKey(state) !== keyNow;
		if (slot?.subject === subject && isNewSlot) {
			state.currentLocationId = slot.location as string;
			return;
		}
	}
	throw new Error(`no ${subject} class within two weeks`);
}

/** Puts the player wherever the NPC is at the current time. */
export function moveToNpc(state: GameState, registry: Registry, npcId: string): void {
	const npc = registry.getNPC(npcId);
	const location = npc && npcLocation(npc, momentOf(state, registry));
	if (!location) throw new Error(`${npcId} is not anywhere right now`);
	state.currentLocationId = location;
}

function slotKey(state: GameState): string {
	return `${state.worldClock.getDay()}.${state.worldClock.timeOfDay}`;
}
