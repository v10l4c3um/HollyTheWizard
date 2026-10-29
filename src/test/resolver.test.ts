import { collectingLogger } from "./helpers/collectingLogger";
import Resolver from "../core/engine/Resolver";
import Registry from "../core/Registry";
import NPC from "../core/domain/npc/Npc";
import { OllamaConfig } from "../ai/OllamaConfig";
import { OLLAMA_RESOLVER_TIMEOUT_MS } from "../ai/OllamaClient";
import { commandReply } from "./helpers/fakeOllama";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

/**
 * Helper: mock fetch to return a sequence of Ollama JSON responses. For
 * readability the first two are given the old way, as the intent and then its
 * arguments, and become the single command reply (`target` is translated to
 * the command's own target field); any further ones are pick answers.
 */
function mockOllamaResponses(...responses: string[]) {
	let replies = responses;
	try {
		const first = JSON.parse(responses[0]);
		const args = JSON.parse(responses[1] ?? "{}");
		if (first && typeof first.intent === "string") {
			replies = [JSON.stringify(commandReply({ intent: first.intent, args })), ...responses.slice(2)];
		}
	} catch {
		// not JSON: pass the responses through as they are
	}
	let call = 0;
	(global.fetch as jest.Mock).mockImplementation(() => {
		const response = replies[call++] ?? "";
		return Promise.resolve({
			ok: true,
			json: async () => ({ response }),
		});
	});
}

describe("Resolver", () => {
	const originalFetch = global.fetch;
	let errorSpy: jest.SpyInstance;
	let logs: ReturnType<typeof collectingLogger>;
	let warnSpy: jest.SpyInstance;

	beforeEach(() => {
		global.fetch = jest.fn() as unknown as typeof fetch;
		logs = collectingLogger();
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

	it("resolves save and load without calling the model", async () => {
		const resolver = new Resolver(TEST_CONFIG, undefined, logs);

		await expect(resolver.resolve("save game1")).resolves.toEqual({
			type: "SAVE",
			filename: "game1",
		});
		await expect(resolver.resolve("load")).resolves.toEqual({
			type: "LOAD",
			filename: "quicksave",
			fallbackFilename: "autosave",
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("still sends a sentence that merely starts with save to the model", async () => {
		mockOllamaResponses(
			JSON.stringify({ intent: "REST" }),
			JSON.stringify({ duration: 1 }),
		);

		await new Resolver(TEST_CONFIG, undefined, logs).resolve("save the day by resting");

		expect(global.fetch).toHaveBeenCalled();
	});

	it("resolves a MOVE command from one Ollama response", async () => {
		mockOllamaResponses(
			JSON.stringify({ intent: "MOVE" }),
			JSON.stringify({ target: "forest" }),
		);

		const resolver = new Resolver(TEST_CONFIG, undefined, logs);
		await expect(resolver.resolve("go to the forest")).resolves.toEqual({
			type: "MOVE",
			destinationId: "forest",
		});
	});

	it("asks the model once for the whole command", async () => {
		mockOllamaResponses(
			JSON.stringify({ intent: "MOVE" }),
			JSON.stringify({ target: "forest" }),
		);

		await new Resolver(TEST_CONFIG, undefined, logs).resolve("go to the forest");

		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("reads a duration the model wrote as text", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: '{"type": "REST", "duration": "3"}' }),
		});

		await expect(new Resolver(TEST_CONFIG, undefined, logs).resolve("rest for 3 hours")).resolves.toEqual({
			type: "REST",
			duration: 3,
		});
	});

	it("returns an unknown command, not a rest, when Ollama is unavailable", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const resolver = new Resolver(TEST_CONFIG, undefined, logs);
		const result = await resolver.resolve("go somewhere");

		expect(result).toEqual({ type: "UNKNOWN", input: "go somewhere" });
		// The failure is logged to the file logger and never printed over the terminal UI.
		expect(logs.at("error").length).toBeGreaterThan(0);
		expect(errorSpy).not.toHaveBeenCalled();
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
		const promise = new Resolver(TEST_CONFIG, undefined, logs)
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

		const resolver = new Resolver(TEST_CONFIG, undefined, logs);
		const result = await resolver.resolve("study charms");

		expect(result).toEqual({ type: "UNKNOWN", input: "study charms" });
		// The failure is logged to the file logger and never printed over the terminal UI.
		expect(logs.at("error").length).toBeGreaterThan(0);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	describe("replies that are not a command", () => {
		const reply = (body: unknown) =>
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: async () => ({ response: JSON.stringify(body) }),
			});

		it.each([
			["a reply wrapped in another object", { data: { type: "MOVE", destinationId: "forest" } }],
			["the wrong key for the type", { answer: "MOVE", target: "library" }],
			["a command that does not exist", { type: "FLY", destinationId: "moon" }],
			["JSON with nothing useful", { foo: "bar", baz: 42 }],
			["a field of the wrong type", { type: "MOVE", destinationId: 42 }],
		])("is not repaired but reported as not understood: %s", async (_label, body) => {
			reply(body);
			const result = await new Resolver(TEST_CONFIG, undefined, logs).resolve("do something");
			expect(result).toEqual({ type: "UNKNOWN", input: "do something" });
			// The failure is logged to the file logger and never printed over the terminal UI.
		expect(logs.at("error").length).toBeGreaterThan(0);
		expect(errorSpy).not.toHaveBeenCalled();
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it("accepts the model saying it does not understand", async () => {
			reply({ type: "UNKNOWN" });
			expect(await new Resolver(TEST_CONFIG, undefined, logs).resolve("blah blah")).toEqual({
				type: "UNKNOWN",
				input: "blah blah",
			});
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
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to Hagrid",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			expect(fetchCalls()).toHaveLength(1);
		});

		it("resolves part of a full name the same way", async () => {
			mockOllamaResponses(...talk("Rubeus"));
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to Rubeus",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			expect(fetchCalls()).toHaveLength(1);
		});

		it("asks the model to choose among the matching candidates only", async () => {
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ id: "percy_weasley" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to the prefect Weasley",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "percy_weasley" });
			expect(fetchCalls()).toHaveLength(2);
			const pickPrompt = promptOfCall(1);
			expect(pickPrompt).toContain("ron_weasley");
			expect(pickPrompt).toContain("percy_weasley");
			expect(pickPrompt).not.toContain("hagrid");
		});

		it("offers everyone when nothing matches by name, so a description can work", async () => {
			mockOllamaResponses(
				...talk("the gamekeeper"),
				JSON.stringify({ id: "hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to the gamekeeper",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "hagrid" });
			const pickPrompt = promptOfCall(1);
			expect(pickPrompt).toContain("Large, friendly gamekeeper");
			expect(pickPrompt).toContain("percy_weasley");
		});

		it("keeps the player's text when the model answers none", async () => {
			mockOllamaResponses(...talk("Gandalf"), JSON.stringify({ id: "none" }));
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to Gandalf",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "Gandalf" });
		});

		it("keeps the player's text when the model picks someone it was not offered", async () => {
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ id: "hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to Weasley",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "Weasley" });
		});

		it("keeps the player's text, and does not fall back to REST, when the pick call fails", async () => {
			mockOllamaResponses(...talk("Weasley"), "not-json-at-all");
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
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
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"talk to the boy who lived",
			);

			expect(command).toMatchObject({ type: "TALK", npcId: "harry_potter" });
			expect(fetchCalls()).toHaveLength(1);
		});

		it("shows epithets to the model when it has to choose", async () => {
			registry = new Registry();
			registry.registerNPC(
				new NPC("ron_weasley", "Ron Weasley", [], "Loyal and funny"),
			);
			registry.registerNPC(
				new NPC("percy_weasley", "Percy Weasley", [], "Prefect", [
					"the head boy",
				]),
			);
			mockOllamaResponses(
				...talk("Weasley"),
				JSON.stringify({ id: "percy_weasley" }),
			);
			await new Resolver(TEST_CONFIG, registry, logs).resolve("talk to Weasley");

			expect(promptOfCall(1)).toContain("the head boy");
		});

		it("does nothing extra without a registry", async () => {
			mockOllamaResponses(...talk("Hagrid"));
			const command = await new Resolver(TEST_CONFIG, undefined, logs).resolve("talk to Hagrid");

			expect(command).toMatchObject({ type: "TALK", npcId: "Hagrid" });
			expect(fetchCalls()).toHaveLength(1);
		});

		it("leaves other targets alone", async () => {
			mockOllamaResponses(
				JSON.stringify({ intent: "MOVE" }),
				JSON.stringify({ target: "Hagrid" }),
			);
			const command = await new Resolver(TEST_CONFIG, registry, logs).resolve(
				"go to Hagrid",
			);

			expect(command).toEqual({ type: "MOVE", destinationId: "Hagrid" });
			expect(fetchCalls()).toHaveLength(1);
		});
	});
});
