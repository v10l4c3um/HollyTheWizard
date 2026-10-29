import { z } from "zod";
import { BlueprintLLMProvider } from "../ai/providers/BlueprintLLMProvider";
import { OllamaConfig } from "../ai/OllamaConfig";
import { OLLAMA_BLUEPRINT_TIMEOUT_MS } from "../ai/OllamaClient";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

describe("BlueprintLLMProvider", () => {
	const originalFetch = global.fetch;
	let warnSpy: jest.SpyInstance;
	let errorSpy: jest.SpyInstance;
	let debugSpy: jest.SpyInstance;

	beforeEach(() => {
		global.fetch = jest.fn() as unknown as typeof fetch;
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		debugSpy.mockRestore();
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	it("returns null when the request keeps failing, without a repair pass", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const provider = new BlueprintLLMProvider(TEST_CONFIG);
		const promise = provider.generateJson(
			"Generate a blueprint",
			z.object({ ok: z.boolean() }),
		);

		await jest.advanceTimersByTimeAsync(4000);

		await expect(promise).resolves.toBeNull();
		// 1 try + 3 retries; there is no response text to repair, so no second pass.
		expect(global.fetch).toHaveBeenCalledTimes(4);
	});

	it("returns null after one blueprint timeout when the model hangs", async () => {
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
		const promise = new BlueprintLLMProvider(TEST_CONFIG)
			.generateJson("Generate a blueprint", z.object({ ok: z.boolean() }))
			.finally(() => (settled = true));

		await jest.advanceTimersByTimeAsync(OLLAMA_BLUEPRINT_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await jest.advanceTimersByTimeAsync(1);

		await expect(promise).resolves.toBeNull();
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("still repairs a reply that arrived but was invalid", async () => {
		(global.fetch as jest.Mock)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: "not json at all" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: '{"ok": true}' }),
			});

		const result = await new BlueprintLLMProvider(TEST_CONFIG).generateJson(
			"Generate a blueprint",
			z.object({ ok: z.boolean() }),
		);

		expect(result).toEqual({ ok: true });
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});
});
