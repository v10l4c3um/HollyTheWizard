import {
	generateWithOllama,
	probeOllamaConnectivity,
	probeOllamaConnection,
} from "../core/engine/OllamaClient";
import { OllamaConfig } from "../core/engine/OllamaConfig";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

describe("OllamaClient", () => {
	const originalFetch = global.fetch;
	let warnSpy: jest.SpyInstance;
	let errorSpy: jest.SpyInstance;

	beforeEach(() => {
		global.fetch = jest.fn() as unknown as typeof fetch;
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	it("returns generated text on success", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({ response: "resolved text" }),
		});

		await expect(
			generateWithOllama(TEST_CONFIG, "hello"),
		).resolves.toBe("resolved text");
	});

	it("throws a normalized HTTP error for non-OK responses", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		await expect(
			generateWithOllama(TEST_CONFIG, "hello", { maxRetries: 0 }),
		).rejects.toThrow("Ollama returned 500 Internal Server Error");
	});

	it("throws a normalized availability error for rejected fetches", async () => {
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		await expect(
			generateWithOllama(TEST_CONFIG, "hello", { maxRetries: 0 }),
		).rejects.toThrow("Ollama unavailable");
	});

	it("throws a timeout error when the request is aborted", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock).mockImplementation(
			(_url: string, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					const signal = init?.signal as AbortSignal | undefined;
					signal?.addEventListener("abort", () => {
						reject(
							Object.assign(new Error("Aborted"), {
								name: "AbortError",
							}),
						);
					});
				}),
		);

		const promise = generateWithOllama(TEST_CONFIG, "hello", {
			timeoutMs: 10,
			maxRetries: 0,
		});
		const expectation = expect(promise).rejects.toThrow(
			"Ollama request timed out",
		);

		await jest.advanceTimersByTimeAsync(10);

		await expectation;
	});

	it("retries with backoff and succeeds on a later attempt", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock)
			.mockRejectedValueOnce(new TypeError("connect ECONNREFUSED"))
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: "after retry" }),
			});

		const promise = generateWithOllama(TEST_CONFIG, "hello", {
			maxRetries: 1,
			retryBaseDelayMs: 10,
		});

		await Promise.resolve();
		expect(global.fetch).toHaveBeenCalledTimes(1);

		await jest.advanceTimersByTimeAsync(10);

		await expect(promise).resolves.toBe("after retry");
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it("fails after exhausting all retries", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const promise = generateWithOllama(TEST_CONFIG, "hello", {
			maxRetries: 2,
			retryBaseDelayMs: 10,
		});
		const expectation = expect(promise).rejects.toThrow(
			"Ollama unavailable",
		);

		await jest.advanceTimersByTimeAsync(30);

		await expectation;
		expect(global.fetch).toHaveBeenCalledTimes(3);
	});

	it("probes the Ollama endpoint with a health-check request", async () => {
		(global.fetch as jest.Mock)
			.mockResolvedValueOnce({
				ok: true,
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ response: "OK" }),
			});

		await expect(probeOllamaConnection(TEST_CONFIG)).resolves.toBeUndefined();
		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(global.fetch).toHaveBeenNthCalledWith(
			1,
			"http://localhost:11434/api/tags",
			expect.objectContaining({
				method: "GET",
				signal: expect.any(AbortSignal),
			}),
		);
		expect(global.fetch).toHaveBeenNthCalledWith(
			2,
			"http://localhost:11434/api/generate",
			expect.objectContaining({
				method: "POST",
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("probes Ollama connectivity on /api/tags", async () => {
		(global.fetch as jest.Mock).mockResolvedValue({
			ok: true,
		});

		await expect(
			probeOllamaConnectivity(TEST_CONFIG),
		).resolves.toBeUndefined();
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:11434/api/tags",
			expect.objectContaining({
				method: "GET",
				signal: expect.any(AbortSignal),
			}),
		);
	});
});
