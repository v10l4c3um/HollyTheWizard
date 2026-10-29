import GameState from "../domain/world/GameState";
import { InWorldCommand } from "../domain/commands/CommandDefinitions";
import { GameBus } from "../domain/events/GameEvents";
import { Logger, silentLogger } from "../application/ports/Logger";
import { applyEffects } from "../domain/effects/EffectApplier";
import { timeAdvanced } from "../domain/effects/GameEffects";
import { TurnResult } from "./TurnResult";

/**
 * The two steps of an in-world turn that come after the rule has decided:
 * the clock moves, then the world is told what happened. They are separate
 * from `TurnResolver.decide` so the turn pipeline can list them as stages.
 */

/** Moves the clock by the turn's time cost and records how far it moved. */
export function advanceTime(
	result: TurnResult,
	state: GameState,
	bus: GameBus,
	logger: Logger = silentLogger,
): void {
	if (result.timeCost.type !== "minutes") return;
	const beforeTimeOfDay = state.worldClock.timeOfDay;
	const effect = timeAdvanced(result.timeCost.amount);
	applyEffects(state, [effect], bus, logger);
	result.effects = [...(result.effects ?? []), effect];
	result.timePassed = {
		minutes: result.timeCost.amount,
		beforeTimeOfDay,
		afterTimeOfDay: state.worldClock.timeOfDay,
	};
}

/**
 * Tells the world what happened: the events the rule asked for, in order, then
 * `ActionResolved`. Run after the clock has moved, so a listener sees the
 * finished turn.
 */
export function announce(
	command: InWorldCommand,
	result: TurnResult,
	state: GameState,
	bus: GameBus,
): void {
	for (const { name, payload } of result.emits ?? []) {
		bus.emit(name as never, payload as never);
	}

	// Generic "something happened" hook for cross-cutting systems (rumors,
	// suspicion, achievements, ...): the rule says how the action turned out.
	bus.emit("ActionResolved", {
		actionType: command.type,
		locationId: state.currentLocationId,
		outcome: result.outcome,
	});
}
