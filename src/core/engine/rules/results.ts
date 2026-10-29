import { GameEffect } from "../../domain/effects/GameEffects";
import { EmittedEvent } from "../../domain/events/GameEvents";
import { TurnResult } from "../TurnResult";

/** Not a valid request: nothing happened and no time passed. */
export function refusal(briefOutput: string): TurnResult {
	return {
		briefOutput,
		events: [],
		timeCost: { type: "none" },
		outcome: "failure",
	};
}

/** Tried and did not work: it cost time. */
export function blocked(
	briefOutput: string,
	events: string[],
	minutes: number,
): TurnResult {
	return {
		briefOutput,
		events,
		timeCost: { type: "minutes", amount: minutes },
		outcome: "blocked",
	};
}

/** It happened. */
export function done(result: {
	briefOutput: string;
	events: string[];
	minutes: number;
	effects?: GameEffect[];
	emits?: EmittedEvent[];
}): TurnResult {
	return {
		briefOutput: result.briefOutput,
		events: result.events,
		timeCost: { type: "minutes", amount: result.minutes },
		outcome: "success",
		effects: result.effects,
		emits: result.emits,
	};
}
