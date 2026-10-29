import GameState from "./GameState";
import Registry from "../../Registry";
import {
	GameEffect,
	locationChanged,
	locationsDiscovered,
} from "../effects/GameEffects";

/**
 * Places you can see from where you stand that you have not found yet. Being
 * somewhere shows you its exits; that is the only way to discover a place.
 */
export function undiscoveredExits(
	registry: Registry,
	state: GameState,
	locationId: string,
): string[] {
	return (registry.getLocation(locationId)?.connectedLocationsIds ?? []).filter(
		(id) => !state.discoveredLocationIds.includes(id),
	);
}

/** Effects for arriving at `locationId`: be there (visited) and see its exits. */
export function arrivalEffects(
	registry: Registry,
	state: GameState,
	locationId: string,
): GameEffect[] {
	return [
		locationChanged(locationId),
		locationsDiscovered(undiscoveredExits(registry, state, locationId)),
	];
}
