import { engineFactory } from "../bootstrap/engineFactory";

describe("engineFactory startup checks", () => {
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

	it("fails startup with a technical Ollama error when health checks fail", async () => {
		jest.useFakeTimers();
		(global.fetch as jest.Mock).mockRejectedValue(
			new TypeError("connect ECONNREFUSED"),
		);

		const promise = engineFactory();
		const expectation = expect(promise).rejects.toThrow(
			"Startup failed: Ollama unavailable at http://localhost:11434/api/generate",
		);
		await jest.advanceTimersByTimeAsync(2000);

		await expectation;
	});
});
