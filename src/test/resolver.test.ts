import Resolver from "../core/engine/Resolver";
import { OllamaConfig } from "../core/engine/OllamaConfig";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

/** Helper: mock fetch to return a sequence of Ollama JSON responses. */
function mockOllamaResponses(...responses: string[]) {
	let call = 0;
	(global.fetch as jest.Mock).mockImplementation(() => {
		const response = responses[call++] ?? "";
		return Promise.resolve({
			ok: true,
			json: async () => ({ response }),
		});
	});
}

describe("Resolver", () => {
	const originalFetch = global.fetch;
	let errorSpy: jest.SpyInstance;
	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		global.fetch = jest.fn() as unknown as typeof fetch;
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		errorSpy.mockRestore();
		warnSpy.mockRestore();
		jest.clearAllMocks();
	});

	it("resolves a MOVE command from two-stage Ollama responses", async () => {
		mockOllamaResponses(
			JSON.stringify({ intent: "MOVE" }),
			JSON.stringify({ target: "forest" }),
		);

		const resolver = new Resolver(TEST_CONFIG);
		await expect(resolver.resolve("go to the forest")).resolves.toEqual({
			type: "MOVE",
			destinationId: "forest",
		});
	});

	it("coerces string duration to number via Zod", async () => {
		mockOllamaResponses(
			JSON.stringify({ intent: "REST" }),
			JSON.stringify({ duration: "3" }), // model returned a string, not a number
		);

		const resolver = new Resolver(TEST_CONFIG);
		await expect(resolver.resolve("rest for 3 hours")).resolves.toEqual({
			type: "REST",
			duration: 3,
			locationId: undefined,
		});
	});

	it("returns a REST fallback when Ollama is unavailable", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const resolver = new Resolver(TEST_CONFIG);
		const result = await resolver.resolve("go somewhere");

		expect(result).toEqual({ type: "REST", duration: 1 });
		expect(errorSpy).toHaveBeenCalled();
	});

	it("returns a REST fallback when Ollama returns non-JSON", async () => {
		mockOllamaResponses("not-json-at-all");

		const resolver = new Resolver(TEST_CONFIG);
		const result = await resolver.resolve("study charms");

		expect(result).toEqual({ type: "REST", duration: 1 });
		expect(errorSpy).toHaveBeenCalled();
	});

	describe("Zod repair step", () => {
		it("repairs a deeply nested intent response via deep-flatten", async () => {
			// Model wrapped answer in an extra object layer
			mockOllamaResponses(
				JSON.stringify({ data: { intent: "MOVE" } }),
				JSON.stringify({ target: "forest" }),
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("move to the forest");

			expect(result).toEqual({ type: "MOVE", destinationId: "forest" });
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Zod validation failed"));
		});

		it("repairs a deeply nested args response via deep-flatten", async () => {
			mockOllamaResponses(
				JSON.stringify({ intent: "REST" }),
				JSON.stringify({ result: { duration: 2 } }), // nested args
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("rest a while");

			expect(result).toEqual({ type: "REST", duration: 2, locationId: undefined });
		});

		it("repairs enum via string scan when intent is buried in unrecognized key", async () => {
			// Model returned something like { answer: "MOVE" } — wrong key, right value
			mockOllamaResponses(
				JSON.stringify({ answer: "MOVE" }),
				JSON.stringify({ target: "library" }),
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("head to the library");

			expect(result).toEqual({ type: "MOVE", destinationId: "library" });
		});

		it("returns REST fallback when Zod validation cannot be repaired", async () => {
			// Both calls return completely useless JSON with no valid enum value
			mockOllamaResponses(
				JSON.stringify({ foo: "bar", baz: 42 }),
				JSON.stringify({ x: 1 }),
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("do something");

			expect(result).toEqual({ type: "REST", duration: 1 });
			expect(errorSpy).toHaveBeenCalled();
		});
	});
});

