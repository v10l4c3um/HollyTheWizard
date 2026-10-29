import GameState from "../domain/world/GameState";

export type TurnErrorKind = "invalid-input" | "persistence" | "internal";

export interface TurnError {
	kind: TurnErrorKind;
	/** Safe to show the player. */
	message: string;
	/** Underlying failure, for the log only. */
	cause?: unknown;
}

/** What one call to `handleCommand` produced. */
export interface TurnOutcome {
	state: GameState;
	/** The text to show the player (also stored in `state.output`). */
	narration: string;
	error?: TurnError;
}
