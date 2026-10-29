import { collectingLogger } from "./helpers/collectingLogger";
import Renderer from "../core/engine/Renderer";
import { OLLAMA_RENDER_TIMEOUT_MS } from "../ai/OllamaClient";
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
	day: 3,
	weekday: "wednesday",
	nearbyNPCNames: [],
	recentEvents: [],
	narrationMode: "default",
};

describe("Renderer", () => {
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

	it("tells the narrator which day and weekday it is", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: "A calm scene unfolds." }),
		});

		await new Renderer(TEST_CONFIG, logs).render(TEST_CONTEXT);

		const { prompt } = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
		expect(prompt).toContain("Wednesday");
		expect(prompt).toContain("day 3");
		expect(prompt).toContain("morning");
	});

	it("returns narrated output when Ollama succeeds", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: " A calm scene unfolds. " }),
		});

		const renderer = new Renderer(TEST_CONFIG, logs);

		await expect(renderer.render(TEST_CONTEXT)).resolves.toBe(
			"A calm scene unfolds.",
		);
	});

	it("falls back to the plain facts when Ollama is unavailable", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const renderer = new Renderer(TEST_CONFIG, logs);
		const result = await renderer.render(TEST_CONTEXT);

		expect(result).toBe(TEST_CONTEXT.briefOutput);
		// The failure is logged to the file logger and never printed over the terminal UI.
		expect(logs.at("error").length).toBeGreaterThan(0);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("falls back to the plain facts when Ollama returns malformed JSON", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => {
				throw new Error("invalid json");
			},
		});

		const renderer = new Renderer(TEST_CONFIG, logs);
		const result = await renderer.render(TEST_CONTEXT);

		expect(result).toBe(TEST_CONTEXT.briefOutput);
		// The failure is logged to the file logger and never printed over the terminal UI.
		expect(logs.at("error").length).toBeGreaterThan(0);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("gives up on a hung model at the render timeout and shows the plain facts", async () => {
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
		const promise = new Renderer(TEST_CONFIG, logs)
			.render(TEST_CONTEXT)
			.finally(() => (settled = true));

		await jest.advanceTimersByTimeAsync(OLLAMA_RENDER_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await jest.advanceTimersByTimeAsync(1);

		await expect(promise).resolves.toBe(TEST_CONTEXT.briefOutput);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
