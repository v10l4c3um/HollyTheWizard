import Renderer from "../core/engine/Renderer";
import { OllamaConfig } from "../ai/OllamaConfig";
import { RenderContext } from "../core/engine/RenderContext";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

const TEST_CONTEXT: RenderContext = {
	briefOutput: "You walk forward.",
	playerName: "Holly",
	locationName: "Forest",
	locationDescription: "Tall trees surround you.",
	timeOfDay: "morning",
	nearbyNPCNames: [],
	recentEvents: [],
	narrationMode: "default",
};

describe("Renderer", () => {
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

	it("returns narrated output when Ollama succeeds", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: " A calm scene unfolds. " }),
		});

		const renderer = new Renderer(TEST_CONFIG);

		await expect(renderer.render(TEST_CONTEXT)).resolves.toBe(
			"A calm scene unfolds.",
		);
	});

	it("returns fallback narration when Ollama is unavailable", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const renderer = new Renderer(TEST_CONFIG);
		const result = await renderer.render(TEST_CONTEXT);

		expect(result).toBe("Nothing happened. AI narration is unavailable.");
		expect(errorSpy).toHaveBeenCalled();
	});

	it("returns fallback narration when Ollama returns malformed JSON", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => {
				throw new Error("invalid json");
			},
		});

		const renderer = new Renderer(TEST_CONFIG);
		const result = await renderer.render(TEST_CONTEXT);

		expect(result).toBe("Nothing happened. AI narration is unavailable.");
		expect(errorSpy).toHaveBeenCalled();
	});
});
