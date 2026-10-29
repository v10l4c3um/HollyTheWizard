import { TimeCost } from "./TimeCost";
import { GameEffect } from "../domain/effects/GameEffects";
import type { TurnFact } from "../domain/facts/TurnFact";
import type { ActionOutcome, EmittedEvent } from "../domain/events/GameEvents";

export interface TurnResult {
	/** The facts, worded by `presentation/facts`: what the player and the narrator are told. */
	briefOutput: string;
	/** What happened. Anything but a refusal is recorded in `GameState.recentFacts`. */
	facts: TurnFact[];
	timeCost: TimeCost;
	/** Stated by the rule that produced the result, never inferred from the other fields. */
	outcome: ActionOutcome;
	/**
	 * Every effect applied to `GameState` this turn (via `applyEffects`),
	 * surfaced so the renderer can eventually show an "effects summary"
	 * alongside the narrated outcome (docs/event-effect-conversion-plan.md,
	 * Step 10).
	 */
	effects?: GameEffect[];
	/**
	 * Events the rule wants announced on the bus. They are emitted after the
	 * turn's bookkeeping (clock, event log), so a listener sees the finished turn.
	 */
	emits?: EmittedEvent[];
	/** Set by `TurnResolver.apply` when the turn advanced the clock. */
	timePassed?: TimePassed;
}

export interface TimePassed {
	minutes: number;
	beforeTimeOfDay: string;
	afterTimeOfDay: string;
}
