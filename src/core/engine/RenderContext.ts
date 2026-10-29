import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { npcsAt } from "../domain/npc/Presence";
import { TimePassed } from "./TurnResult";

export interface RenderContext {
	briefOutput: string;
	playerName: string;
	locationName: string;
	locationDescription: string;
	timeOfDay: string;
	/** Calendar day, from 1. */
	day: number;
	weekday: string;
	nearbyNPCNames: string[];
	recentEvents: string[];
	narrationMode: string;
	timePassed?: TimePassed;
}

/** Everything the narrator is told about the moment, from the current state. */
export function buildRenderContext(
	registry: Registry,
	state: GameState,
	briefOutput: string,
	timePassed?: TimePassed,
): RenderContext {
	const location = registry.getLocation(state.currentLocationId);
	return {
		briefOutput,
		playerName: state.player.name,
		locationName: location?.displayName ?? state.currentLocationId,
		locationDescription: location?.description ?? "",
		timeOfDay: state.worldClock.timeOfDay,
		day: state.worldClock.getDay(),
		weekday: state.worldClock.getWeekday(),
		nearbyNPCNames: npcsAt(registry, state).map((npc) => npc.name),
		recentEvents: state.recentEvents.slice(-5),
		narrationMode: state.settings.narrationMode,
		timePassed,
	};
}
