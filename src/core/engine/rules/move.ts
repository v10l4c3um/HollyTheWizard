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
	if (!current) return refusal("You seem to be nowhere. Something is wrong.");

	const whereToGo = describeExits(current, state, registry);

	const destination = registry.getLocation(destinationId);
	if (!destination) {
		return refusal(
			`You don't know of a place called "${destinationId}". ${whereToGo}`,
		);
	}

	const name = destination.displayName;
	if (!current.connectedLocationsIds.includes(destinationId)) {
		return blocked(
			`You can't move to ${name} from ${current.displayName}. ${whereToGo}`,
			[`Failed to move from ${current.displayName} to ${name}`],
			2,
		);
	}

	if (!state.discoveredLocationIds.includes(destinationId)) {
		return refusal(`You haven't found a way to ${name} yet.`);
	}

	const isFirstVisit = !state.visitedLocationIds.includes(destinationId);
	// Arriving shows you the exits of the new place.
	const seen = undiscoveredExits(registry, state, destinationId);
	const effects = arrivalEffects(registry, state, destinationId);
	ctx.apply(effects);

	return done({
		briefOutput: `You traveled to ${name}.`,
		events: [`Moved from ${current.displayName} to ${name}`],
		minutes: 5,
		effects,
		emits: [
			event("LocationVisited", { locationId: destinationId, isFirstVisit }),
			...seen.map((locationId) => event("LocationDiscovered", { locationId })),
		],
	});
}

/** "From the Hall you can go to: A, B." Only places the player has found. */
function describeExits(
	current: { displayName: string; connectedLocationsIds: string[] },
	state: GameState,
	registry: Registry,
): string {
	const names = current.connectedLocationsIds
		.filter((id) => state.discoveredLocationIds.includes(id))
		.map((id) => registry.getLocation(id)?.displayName ?? id);
	return names.length > 0
		? `From ${current.displayName} you can go to: ${names.join(", ")}.`
		: `There is nowhere to go from ${current.displayName} yet.`;
}
