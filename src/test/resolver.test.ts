import Resolver from "../core/engine/Resolver";
import Registry from "../core/Registry";
import NPC from "../core/domain/npc/Npc";
import { OllamaConfig } from "../ai/OllamaConfig";
import { OLLAMA_RESOLVER_TIMEOUT_MS } from "../ai/OllamaClient";

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
		jest.useRealTimers();
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

	it("returns an unknown command, not a rest, when Ollama is unavailable", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const resolver = new Resolver(TEST_CONFIG);
		const result = await resolver.resolve("go somewhere");

		expect(result).toEqual({ type: "UNKNOWN", input: "go somewhere" });
		expect(errorSpy).toHaveBeenCalled();
	});

	it("gives up on a hung model at the resolver timeout and reports it as not understood", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock).mockImplementation(
			(_url: string, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					(init?.signal as AbortSignal | undefined)?.addEventListener(
						"abort",
						() =>
							reject(
								Object.assign(new Error("Aborted"), {
									name: "AbortError",
								}),
							),
					);
				}),
		);

		let settled = false;
		const promise = new Resolver(TEST_CONFIG)
			.resolve("go to the forest")
			.finally(() => (settled = true));

		await jest.advanceTimersByTimeAsync(OLLAMA_RESOLVER_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await jest.advanceTimersByTimeAsync(1);

		await expect(promise).resolves.toEqual({
			type: "UNKNOWN",
			input: "go to the forest",
		});
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("returns an unknown command when Ollama returns non-JSON", async () => {
		mockOllamaResponses("not-json-at-all");

		const resolver = new Resolver(TEST_CONFIG);
		const result = await resolver.resolve("study charms");

		expect(result).toEqual({ type: "UNKNOWN", input: "study charms" });
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
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Zod validation failed"),
			);
		});

		it("repairs a deeply nested args response via deep-flatten", async () => {
			mockOllamaResponses(
				JSON.stringify({ intent: "REST" }),
				JSON.stringify({ result: { duration: 2 } }), // nested args
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("rest a while");

			expect(result).toEqual({
				type: "REST",
				duration: 2,
				locationId: undefined,
			});
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

		it("returns an unknown command when Zod validation cannot be repaired", async () => {
			// Both calls return completely useless JSON with no valid enum value
			mockOllamaResponses(
				JSON.stringify({ foo: "bar", baz: 42 }),
				JSON.stringify({ x: 1 }),
			);

			const resolver = new Resolver(TEST_CONFIG);
			const result = await resolver.resolve("do something");

			expect(result).toEqual({ type: "UNKNOWN", input: "do something" });
			expect(errorSpy).toHaveBeenCalled();
		});
	});

	describe("grounding the NPC target in the registry", () => {
		let registry: Registry;

		beforeEach(() => {
			registry = new Registry();
			registry.registerNPC(
				new NPC("hagrid", "Rubeus Hagrid", [], "Large, friendly gamekeeper"),
			);
			registry.registerNPC(
				new NPC("ron_weasley", "Ron Weasley", [], "Loyal and funny"),
			);
			registry.registerNPC(
				new NPC("percy_weasley", "Percy Weasley", [], "Prefect, by the book"),
			);
		});

		const talk = (target: string) => [
			JSON.stringify({ intent: "TALK" }),
			JSON.stringify({ target }),
		];
		const fetchCalls = () => (global.fetch as jest.Mock).mock.calls;
		const promptOfCall = (index: number): string =>
			JSON.parse(fetchCalls()[index][1].body).prompt;

		it("resolves a clear name to its id without another model call", async () => {
			mockOllamaResponses(...talk("Hagrid"));
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to Hagrid",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			expect(fetchCalls()).toHaveLength(2);
		});

		it("resolves part of a full name the same way", async () => {
			mockOllamaResponses(...talk("Rubeus"));
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to Rubeus",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			expect(fetchCalls()).toHaveLength(2);
		});

		it("asks the model to choose among the matching candidates only", async () => {
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ npcId: "percy_weasley" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to the prefect Weasley",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "percy_weasley" });
			expect(fetchCalls()).toHaveLength(3);
			const pickPrompt = promptOfCall(2);
			expect(pickPrompt).toContain("ron_weasley");
			expect(pickPrompt).toContain("percy_weasley");
			expect(pickPrompt).not.toContain("hagrid");
		});

		it("offers everyone when nothing matches by name, so a description can work", async () => {
			mockOllamaResponses(
				...talk("the gamekeeper"),
				JSON.stringify({ npcId: "hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to the gamekeeper",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			const pickPrompt = promptOfCall(2);
			expect(pickPrompt).toContain("Large, friendly gamekeeper");
			expect(pickPrompt).toContain("percy_weasley");
		});

		it("keeps the player's text when the model answers none", async () => {
			mockOllamaResponses(...talk("Gandalf"), JSON.stringify({ npcId: "none" }));
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to Gandalf",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "Gandalf" });
		});

		it("keeps the player's text when the model picks someone it was not offered", async () => {
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ npcId: "hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to Weasley",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "Weasley" });
		});

		it("keeps the player's text, and does not fall back to REST, when the pick call fails", async () => {
			mockOllamaResponses(...talk("Weasley"), "not-json-at-all");
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to Weasley",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "Weasley" });
		});

		it("resolves an epithet to its NPC without another model call", async () => {
			registry.registerNPC(
				new NPC("harry_potter", "Harry Potter", [], "Brave", [
					"the boy who lived",
				]),
			);
			mockOllamaResponses(...talk("the boy who lived"));
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"talk to the boy who lived",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "harry_potter" });
			expect(fetchCalls()).toHaveLength(2);
		});

		it("shows epithets to the model when it has to choose", async () => {
			registry.registerNPC(
				new NPC("percy_weasley", "Percy Weasley", [], "Prefect", [
					"the head boy",
				]),
			);
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ npcId: "percy_weasley" }),
			);
			await new Resolver(TEST_CONFIG, registry).resolve("talk to Weasley");

			expect(promptOfCall(2)).toContain("the head boy");
		});

		it("does nothing extra without a registry", async () => {
			mockOllamaResponses(...talk("Hagrid"));
			const command = await new Resolver(TEST_CONFIG).resolve("talk to Hagrid");

			expect(command).toMatchObject({ type: "TALK", npcId: "Hagrid" });
			expect(fetchCalls()).toHaveLength(2);
		});

		it("leaves other targets alone", async () => {
			mockOllamaResponses(
				JSON.stringify({ intent: "MOVE" }),
				JSON.stringify({ target: "Hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry).resolve(
				"go to Hagrid",
			);

			expect(command).toEqual({ type: "MOVE", destinationId: "Hagrid" });
			expect(fetchCalls()).toHaveLength(2);
		});
	});
});
