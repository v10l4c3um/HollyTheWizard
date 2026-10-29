import {
	OLLAMA_BLUEPRINT_TIMEOUT_MS,
	OLLAMA_CONNECTIVITY_TIMEOUT_MS,
	OLLAMA_HEALTHCHECK_TIMEOUT_MS,
	OLLAMA_RENDER_TIMEOUT_MS,
	OLLAMA_REQUEST_TIMEOUT_MS,
	OLLAMA_RESOLVER_TIMEOUT_MS,
} from "../ai/OllamaClient";
import {
	DEFAULT_BLUEPRINT_OLLAMA_CONFIG,
	DEFAULT_OLLAMA_CONFIG,
	DEFAULT_RENDERER_OLLAMA_CONFIG,
	DEFAULT_RESOLVER_OLLAMA_CONFIG,
} from "../ai/OllamaConfig";

describe("default Ollama configuration", () => {
	it("leaves debug mode off, so the game is not running in a special mode", () => {
		for (const config of [
			DEFAULT_RESOLVER_OLLAMA_CONFIG,
			DEFAULT_RENDERER_OLLAMA_CONFIG,
			DEFAULT_BLUEPRINT_OLLAMA_CONFIG,
			DEFAULT_OLLAMA_CONFIG,
		]) {
			expect(config.debugMode).toBeFalsy();
		}
	});

	it("has a real timeout for every kind of call", () => {
		for (const timeout of [
			OLLAMA_CONNECTIVITY_TIMEOUT_MS,
			OLLAMA_HEALTHCHECK_TIMEOUT_MS,
			OLLAMA_RESOLVER_TIMEOUT_MS,
			OLLAMA_REQUEST_TIMEOUT_MS,
			OLLAMA_RENDER_TIMEOUT_MS,
			OLLAMA_BLUEPRINT_TIMEOUT_MS,
		]) {
			expect(Number.isFinite(timeout)).toBe(true);
			expect(timeout).toBeGreaterThan(0);
		}
	});

	it("gives bigger jobs more time: a blueprint over a paragraph, a cold start over a normal call", () => {
		expect(OLLAMA_BLUEPRINT_TIMEOUT_MS).toBeGreaterThan(OLLAMA_RENDER_TIMEOUT_MS);
		expect(OLLAMA_HEALTHCHECK_TIMEOUT_MS).toBeGreaterThan(OLLAMA_REQUEST_TIMEOUT_MS);
		expect(OLLAMA_CONNECTIVITY_TIMEOUT_MS).toBeLessThan(OLLAMA_REQUEST_TIMEOUT_MS);
	});
});
