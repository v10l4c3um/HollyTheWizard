import { GameEffect } from "../../domain/effects/GameEffects";
import { EmittedEvent } from "../../domain/events/GameEvents";
import { Refusal, TurnFact, refused } from "../../domain/facts/TurnFact";
import { describeFacts } from "../../presentation/facts";
import { TurnResult } from "../TurnResult";

/** Not a valid request: nothing happened and no time passed. */
export function refusal(why: Refusal): TurnResult {
	const facts = [refused(why)];
	return {
		briefOutput: describeFacts(facts),
		facts,
		timeCost: { type: "none" },
		outcome: "failure",
	};
}

/** Tried and did not work: it cost time. */
export function blocked(fact: TurnFact, minutes: number): TurnResult {
	return {
		briefOutput: describeFacts([fact]),
		facts: [fact],
		timeCost: { type: "minutes", amount: minutes },
		outcome: "blocked",
	};
}

/** It happened. */
export function done(result: {
	fact: TurnFact;
	minutes: number;
	effects?: GameEffect[];
	emits?: EmittedEvent[];
}): TurnResult {
	return {
		briefOutput: describeFacts([result.fact]),
		facts: [result.fact],
		timeCost: { type: "minutes", amount: result.minutes },
		outcome: "success",
		effects: result.effects,
		emits: result.emits,
	};
}
