import Resolver from "../core/engine/Resolver";
import { OllamaConfig } from "../core/engine/OllamaConfig";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

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

	it("resolves a normal command from staged Ollama responses", async () => {
		(global.fetch as jest.Mock)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: JSON.stringify({ intent: "MOVE" }) }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: JSON.stringify({ target: "forest" }) }),
			});

		const resolver = new Resolver(TEST_CONFIG);

		await expect(resolver.resolve("go to the forest")).resolves.toEqual({
			type: "MOVE",
			destinationId: "forest",
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

	it("returns a REST fallback when Ollama returns invalid JSON", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: "not-json" }),
		});

		const resolver = new Resolver(TEST_CONFIG);
		const result = await resolver.resolve("study charms");

		expect(result).toEqual({ type: "REST", duration: 1 });
		expect(errorSpy).toHaveBeenCalled();
	});
});
