/**
 * The game's source of chance. Rules take a `Random` instead of calling
 * `Math.random()`, so luck can be replayed (same save, same commands, same
 * outcomes) and fixed in tests.
 */
export interface Random {
	/** A number from 0 (included) to 1 (excluded). */
	next(): number;
	/**
	 * Where a seeded generator stands. Saving it in the game state and resuming
	 * from it continues the same sequence. Absent for fixed test sources.
	 */
	readonly state?: number;
}

/** A small, fast, well-spread generator (mulberry32), resumable from its `state`. */
export function createRandom(state: number): Random {
	let a = state >>> 0;
	return {
		next(): number {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
		get state(): number {
			return a;
		},
	};
}

/** Always the same number: 0 makes every roll succeed, 0.999 makes every roll fail. */
export function fixedRandom(value: number): Random {
	return { next: () => value };
}

/** The given numbers in turn, starting over at the end. */
export function sequenceRandom(values: number[]): Random {
	let i = 0;
	return { next: () => values[i++ % values.length] };
}

/** A starting state for a new game. */
export function freshRandomState(): number {
	return (Date.now() * 2654435761) >>> 0;
}
