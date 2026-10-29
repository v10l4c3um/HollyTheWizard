import Registry from "../../Registry";
import GameState from "../../domain/world/GameState";
import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { event } from "../../domain/events/GameEvents";
import { arrivalEffects, undiscoveredExits } from "../../domain/world/Exploration";
import { TurnContext } from "./context";
import { blocked, done, refusal } from "./results";

type Move = Extract<InWorldCommand, { type: "MOVE" }>;

export function move({ destinationId }: Move, ctx: TurnContext) {
	const { state, registry } = ctx;
	const current = registry.getLocation(state.currentLocationId);
	if (!current) return refusal({ reason: "nowhere" });

	const exits = knownExits(current, state, registry);

	const destination = registry.getLocation(destinationId);
	if (!destination) {
		return refusal({
			reason: "unknown-place",
			input: destinationId,
			from: current.displayName,
			exits,
		});
	}

	const name = destination.displayName;
	if (!current.connectedLocationsIds.includes(destinationId)) {
		return blocked(
			{
				kind: "move-blocked",
				from: { id: current.id, name: current.displayName },
				to: { id: destinationId, name },
				exits,
			},
			2,
		);
	}

	if (!state.discoveredLocationIds.includes(destinationId)) {
		return refusal({ reason: "not-discovered", place: name });
	}

	const isFirstVisit = !state.visitedLocationIds.includes(destinationId);
	// Arriving shows you the exits of the new place.
	const seen = undiscoveredExits(registry, state, destinationId);
	const effects = arrivalEffects(registry, state, destinationId);
	ctx.apply(effects);

	return done({
		fact: {
			kind: "moved",
			from: { id: current.id, name: current.displayName },
			to: { id: destinationId, name },
			firstVisit: isFirstVisit,
			discovered: seen.map((id) => ({
				id,
				name: registry.getLocation(id)?.displayName ?? id,
			})),
		},
		minutes: 5,
		effects,
		emits: [
			event("LocationVisited", { locationId: destinationId, isFirstVisit }),
			...seen.map((locationId) => event("LocationDiscovered", { locationId })),
		],
	});
}

/** Names of the places the player has found a way to from here. */
function knownExits(
	current: { connectedLocationsIds: string[] },
	state: GameState,
	registry: Registry,
): string[] {
	return current.connectedLocationsIds
		.filter((id) => state.discoveredLocationIds.includes(id))
		.map((id) => registry.getLocation(id)?.displayName ?? id);
}
