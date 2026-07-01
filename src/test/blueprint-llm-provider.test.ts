import { z } from "zod";
import { BlueprintLLMProvider } from "../ai/providers/BlueprintLLMProvider";
import { OllamaConfig } from "../ai/OllamaConfig";

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

	it("returns null after retries fail for both the initial and repair passes", async () => {
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
		expect(global.fetch).toHaveBeenCalledTimes(8);
	});
});
