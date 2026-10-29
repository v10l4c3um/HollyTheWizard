import {
	createRandom,
	fixedRandom,
	freshRandomState,
	sequenceRandom,
} from "../core/domain/random/Random";

const draw = (random: { next(): number }, n: number) =>
	Array.from({ length: n }, () => random.next());

describe("createRandom", () => {
	it("gives the same sequence for the same state", () => {
		expect(draw(createRandom(42), 20)).toEqual(draw(createRandom(42), 20));
	});

	it("gives different sequences for different states", () => {
		expect(draw(createRandom(1), 5)).not.toEqual(draw(createRandom(2), 5));
	});

	it("stays in [0, 1) and is reasonably spread", () => {
		const values = draw(createRandom(7), 5000);
		expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
		const mean = values.reduce((a, b) => a + b, 0) / values.length;
		expect(mean).toBeGreaterThan(0.45);
		expect(mean).toBeLessThan(0.55);
	});

	it("can be resumed from its state, continuing the same sequence", () => {
		const first = createRandom(99);
		draw(first, 10);
		const saved = first.state!;
		const rest = draw(first, 10);

		expect(draw(createRandom(saved), 10)).toEqual(rest);
	});
});

describe("sources for tests", () => {
	it("fixedRandom always says the same number and has no state to save", () => {
		const random = fixedRandom(0.25);
		expect(draw(random, 3)).toEqual([0.25, 0.25, 0.25]);
		expect(random.state).toBeUndefined();
	});

	it("sequenceRandom goes through its numbers and starts over", () => {
		expect(draw(sequenceRandom([0.1, 0.9]), 5)).toEqual([0.1, 0.9, 0.1, 0.9, 0.1]);
	});

	it("a fresh state is a whole number", () => {
		const state = freshRandomState();
		expect(Number.isInteger(state)).toBe(true);
		expect(state).toBeGreaterThanOrEqual(0);
	});
});
