import { TimeCost } from "./TimeCost";
import { GameEffect } from "../domain/effects/GameEffects";

export interface TurnResult {
	briefOutput: string;
	events: string[];
	timeCost: TimeCost;
	/**
	 * Every effect applied to `GameState` this turn (via `applyEffects`),
	 * surfaced so the renderer can eventually show an "effects summary"
	 * alongside the narrated outcome (docs/event-effect-conversion-plan.md,
	 * Step 10).
	 */
	effects?: GameEffect[];
	/** Set by `TurnResolver.apply` when the turn advanced the clock. */
	timePassed?: {
		minutes: number;
		beforeTimeOfDay: string;
		afterTimeOfDay: string;
	};
}
