import GameState from "../domain/world/GameState";

/**
 * Holds the live game state. `LOAD` replaces the whole state, so nothing
 * should keep a reference to `state` across turns: read it again, or use the
 * `state` of the `TurnOutcome`. Only `replace` can change which state is live.
 */
export class GameSession {
	constructor(private current: GameState) {}

	get state(): GameState {
		return this.current;
	}

	replace(next: GameState): void {
		this.current = next;
	}
}
