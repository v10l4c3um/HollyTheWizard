import { OllamaConfig } from "./OllamaConfig";

export const OLLAMA_REQUEST_TIMEOUT_MS = 5000;
export const OLLAMA_RESOLVER_TIMEOUT_MS = 15000; // Resolver needs more time for JSON parsing
export const OLLAMA_HEALTHCHECK_TIMEOUT_MS = 10000;
export const OLLAMA_CONNECTIVITY_TIMEOUT_MS = 1000;
export const OLLAMA_MAX_RETRIES = 3;
export const OLLAMA_RETRY_BASE_DELAY_MS = 250;

type OllamaRequestErrorCode =
	| "timeout"
	| "unavailable"
	| "http"
	| "invalid_response"
	| "empty_response"
	| "unknown";

export class OllamaRequestError extends Error {
	constructor(
		message: string,
		public readonly code: OllamaRequestErrorCode,
		public readonly endpoint: string,
	) {
		super(message);
		this.name = "OllamaRequestError";
	}
}

interface OllamaGenerateOptions {
	context?: string;
	format?: object | "json";
	maxRetries?: number;
	retryBaseDelayMs?: number;
	timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
	endpoint: string,
	init: RequestInit,
	timeoutMs?: number,
): Promise<Response> {
	if (timeoutMs === undefined) {
		return fetch(endpoint, init);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(endpoint, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

function resolveTimeout(
	timeoutMs: number,
	config: OllamaConfig,
): number | undefined {
	return config.debugMode ? undefined : timeoutMs;
}

function normalizeError(
	error: unknown,
	endpoint: string,
): OllamaRequestError {
	if (error instanceof OllamaRequestError) {
		return error;
	}

	if (error instanceof Error && error.name === "AbortError") {
		return new OllamaRequestError(
			"Ollama request timed out",
			"timeout",
			endpoint,
		);
	}

	if (error instanceof TypeError) {
		return new OllamaRequestError(
			"Ollama unavailable",
			"unavailable",
			endpoint,
		);
	}

	if (error instanceof Error) {
		return new OllamaRequestError(
			error.message,
			"unknown",
			endpoint,
		);
	}

	return new OllamaRequestError(
		"Ollama request failed",
		"unknown",
		endpoint,
	);
}

function buildGenerateBody(
	config: OllamaConfig,
	prompt: string,
	format?: object | "json",
): string {
	return JSON.stringify({
		model: config.model,
		prompt,
		stream: false,
		...(format ? { format } : {}),
	});
}

function buildConnectivityEndpoint(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		url.pathname = "/api/tags";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return endpoint;
	}
}

export async function generateWithOllama(
	config: OllamaConfig,
	prompt: string,
	options: OllamaGenerateOptions = {},
): Promise<string> {
	const {
		context = "request",
		format,
		maxRetries = OLLAMA_MAX_RETRIES,
		retryBaseDelayMs = OLLAMA_RETRY_BASE_DELAY_MS,
		timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS,
	} = options;

	let lastError: OllamaRequestError | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const body = buildGenerateBody(config, prompt, format);
			if (context === "resolver" && config.debugMode) {
				console.debug(`[Ollama] ${context} request body:`, body);
				if (format) {
					console.debug(`[Ollama] format schema:`, format);
				}
			}

			const response = await fetchWithTimeout(
				config.endpoint,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body,
				},
				resolveTimeout(timeoutMs, config),
			);

			if (!response.ok) {
				throw new OllamaRequestError(
					`Ollama returned ${response.status} ${response.statusText || "Unknown Error"}`,
					"http",
					config.endpoint,
				);
			}

			let data: { response?: unknown };
			try {
				data = (await response.json()) as { response?: unknown };
			} catch {
				throw new OllamaRequestError(
					"Ollama returned an invalid response",
					"invalid_response",
					config.endpoint,
				);
			}
			
			if (context === "resolver" && config.debugMode) {
				console.debug(`[Ollama] ${context} response structure:`, data);
			}

			if (typeof data.response !== "string") {
				throw new OllamaRequestError(
					`Ollama returned invalid response type: ${typeof data.response} (expected string). Full response: ${JSON.stringify(data)}`,
					"invalid_response",
					config.endpoint,
				);
			}

			if (data.response.trim() === "") {
				if (context === "resolver") {
					console.warn(`[Ollama] Empty response for resolver request with format: ${format ? JSON.stringify(format) : "none"}`);
				}
				throw new OllamaRequestError(
					"Ollama returned an empty response. Model may have failed to generate output with the requested format constraints.",
					"empty_response",
					config.endpoint,
				);
			}

			return data.response;
		} catch (error) {
			lastError = normalizeError(error, config.endpoint);

			// Empty responses are deterministic for a given format constraint—
			// retrying with the same schema would just produce the same empty
			// result, so bail out immediately and let the caller handle it.
			if (lastError.code === "empty_response") {
				throw lastError;
			}

			const isFinalAttempt = attempt === maxRetries;

			if (isFinalAttempt) {
				console.error(
					`[Ollama] ${context} failed after ${attempt + 1} attempt(s): ${lastError.message}`,
				);
				throw lastError;
			}

			const delayMs = retryBaseDelayMs * 2 ** attempt;
			console.warn(
				`[Ollama] ${context} attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delayMs}ms.`,
			);
			await sleep(delayMs);
		}
	}

	throw (
		lastError ??
		new OllamaRequestError(
			"Ollama request failed",
			"unknown",
			config.endpoint,
		)
	);
}

export async function probeOllamaConnection(
	config: OllamaConfig,
): Promise<void> {
	await probeOllamaConnectivity(config);
	await generateWithOllama(config, "Respond with OK.", {
		context: "startup health check",
		timeoutMs: resolveTimeout(OLLAMA_HEALTHCHECK_TIMEOUT_MS, config),
	});
}

export async function probeOllamaConnectivity(
	config: OllamaConfig,
): Promise<void> {
	const connectivityEndpoint = buildConnectivityEndpoint(config.endpoint);

	try {
		const response = await fetchWithTimeout(
			connectivityEndpoint,
			{
				method: "GET",
			},
			resolveTimeout(OLLAMA_CONNECTIVITY_TIMEOUT_MS, config),
		);

		if (!response.ok) {
			throw new OllamaRequestError(
				`Ollama returned ${response.status} ${response.statusText || "Unknown Error"}`,
				"http",
				config.endpoint,
			);
		}
	} catch (error) {
		throw normalizeError(error, config.endpoint);
	}
}
