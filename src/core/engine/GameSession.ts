import GameState from "../domain/world/GameState";

/** How many turns `undo` can go back. */
export const HISTORY_LIMIT = 20;

/**
 * Holds the live game state and runs each turn as a transaction.
 *
 * `begin()` makes a copy and that copy is the live state for the turn, so every
 * handler, rule and bus listener (which all read `state` fresh) works on it.
 * `commit()` keeps the result and remembers the state before the turn;
 * `rollback()` throws the copy away and the untouched state is live again.
 * A committed state is never written to again, so the state a caller gets back
 * after a turn is a new object, and earlier ones are snapshots.
 *
 * `LOAD` swaps in a whole new state with `replace`, which also forgets the
 * history. `undo` goes back to the state before the previous committed turn.
 * Do not keep a reference to `state` across turns: read it again, or use the
 * `state` of the `TurnOutcome`.
 */
export class GameSession {
	private current: GameState;
	/** The committed state while a turn is open. */
	private before?: GameState;
	private history: GameState[] = [];
	private replaced = false;
	private undone = false;

	constructor(initial: GameState) {
		this.current = initial;
	}

	get state(): GameState {
		return this.current;
	}

	get canUndo(): boolean {
		return this.history.length > 0;
	}

	get inTurn(): boolean {
		return this.before !== undefined;
	}

	begin(): void {
		if (this.before) throw new Error("A turn is already open.");
		this.before = this.current;
		this.current = this.current.clone();
		this.replaced = false;
		this.undone = false;
	}

	commit(): void {
		if (!this.before) throw new Error("No turn is open.");
		if (this.replaced) {
			this.history = [];
		} else if (!this.undone) {
			this.history.push(this.before);
			if (this.history.length > HISTORY_LIMIT) this.history.shift();
		}
		this.before = undefined;
	}

	rollback(): void {
		if (!this.before) return;
		this.current = this.before;
		this.before = undefined;
	}

	/** Makes `next` the live state (a loaded game). Forgets the history. */
	replace(next: GameState): void {
		this.current = next;
		this.replaced = true;
		if (!this.before) this.history = [];
	}

	/** Goes back to the state before the last committed turn; false if there is none. */
	undo(): boolean {
		const previous = this.history.pop();
		if (!previous) return false;
		this.current = previous;
		this.undone = true;
		return true;
	}
}
