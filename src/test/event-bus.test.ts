import { MAX_DELIVERIES_PER_EMIT, TypedBus } from "../core/engine/EventBus";
import { resetFakeOllama, scriptPlayer } from "./helpers/fakeOllama";
import { buildTestGame } from "./helpers/buildTestGame";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

type Events = { a: number; b: string };

function setup() {
	const errors: { message: string; detail?: unknown }[] = [];
	const logger = {
		debug: () => {},
		warn: () => {},
		error: (message: string, detail?: unknown) => errors.push({ message, detail }),
	};
	return { bus: new TypedBus<Events>(logger), errors };
}

describe("a faulty listener", () => {
	it("is logged and skipped; the emitter and the other listeners carry on", () => {
		const { bus, errors } = setup();
		const seen: number[] = [];
		bus.on("a", () => {
			throw new Error("boom");
		});
		bus.on("a", (n) => seen.push(n));

		expect(() => bus.emit("a", 1)).not.toThrow();

		expect(seen).toEqual([1]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain("a");
		expect((errors[0].detail as Error).message).toBe("boom");
	});

	it("an async listener that rejects is logged, not thrown, and not awaited", async () => {
		const { bus, errors } = setup();
		let finished = false;
		bus.on("a", async () => {
			await Promise.resolve();
			finished = true;
			throw new Error("late");
		});

		bus.emit("a", 1);
		expect(finished).toBe(false);

		await new Promise((resolve) => setImmediate(resolve));
		expect(finished).toBe(true);
		expect(errors.map((e) => (e.detail as Error).message)).toEqual(["late"]);
	});
});

describe("emitting from inside a listener", () => {
	it("delivers the nested event after the current one has reached every listener", () => {
		const { bus } = setup();
		const order: string[] = [];
		bus.on("a", (n) => {
			order.push(`a1:${n}`);
			bus.emit("b", "raised");
		});
		bus.on("a", (n) => order.push(`a2:${n}`));
		bus.on("b", (s) => order.push(`b:${s}`));

		bus.emit("a", 1);

		expect(order).toEqual(["a1:1", "a2:1", "b:raised"]);
	});

	it("stops a listener that keeps re-emitting, with one logged error", () => {
		const { bus, errors } = setup();
		let count = 0;
		bus.on("a", (n) => {
			count++;
			bus.emit("a", n + 1);
		});

		bus.emit("a", 0);

		expect(count).toBe(MAX_DELIVERIES_PER_EMIT);
		expect(errors).toHaveLength(1);

		// and the bus is usable again afterwards
		const seen: string[] = [];
		bus.on("b", (s) => seen.push(s));
		bus.emit("b", "still works");
		expect(seen).toEqual(["still works"]);
	});
});

describe("order and teardown", () => {
	it("runs higher priority first and equal priority in subscription order", () => {
		const { bus } = setup();
		const order: string[] = [];
		bus.on("a", () => order.push("normal-1"));
		bus.on("a", () => order.push("late"), { priority: -5 });
		bus.on("a", () => order.push("first"), { priority: 10 });
		bus.on("a", () => order.push("normal-2"));

		bus.emit("a", 1);

		expect(order).toEqual(["first", "normal-1", "normal-2", "late"]);
	});

	it("on() returns a function that unsubscribes", () => {
		const { bus } = setup();
		const seen: number[] = [];
		const off = bus.on("a", (n) => seen.push(n));
		bus.emit("a", 1);
		off();
		bus.emit("a", 2);
		expect(seen).toEqual([1]);
	});
});

describe("in a running game", () => {
	it("a listener that throws does not undo the turn", async () => {
		resetFakeOllama();
		const game = await buildTestGame();
		try {
			game.bus.on("LocationVisited", () => {
				throw new Error("bad listener");
			});
			scriptPlayer("go to the corridor", { intent: "MOVE", args: { target: "hallway" } });

			const outcome = await game.engine.handleCommand("go to the corridor");

			expect(outcome.error).toBeUndefined();
			expect(game.engine.state.currentLocationId).toBe("hallway");
			expect(game.logged.some((e) => e.message.includes("LocationVisited"))).toBe(true);
		} finally {
			await game.dispose();
		}
	});
});
