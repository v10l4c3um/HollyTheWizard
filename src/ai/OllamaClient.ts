import { OllamaConfig } from "./OllamaConfig";

// Per-attempt limits. Local models are slow, and the first call after idle
// also loads the model, so these are generous; they exist so a stalled
// server cannot freeze the game, not to make a healthy one fast.
export const OLLAMA_REQUEST_TIMEOUT_MS = 20000; // default for calls that set none
export const OLLAMA_RESOLVER_TIMEOUT_MS = 20000; // Resolver needs more time for JSON parsing
export const OLLAMA_RENDER_TIMEOUT_MS = 30000; // one narrated paragraph
export const OLLAMA_BLUEPRINT_TIMEOUT_MS = 90000; // a whole campaign/year blueprint
export const OLLAMA_HEALTHCHECK_TIMEOUT_MS = 60000; // may include a cold model load
export const OLLAMA_CONNECTIVITY_TIMEOUT_MS = 3000;
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
	/** Sampling temperature. 0 makes the answer repeatable (parsing); unset keeps the model's default. */
	temperature?: number;
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

function normalizeError(error: unknown, endpoint: string): OllamaRequestError {
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
		return new OllamaRequestError(error.message, "unknown", endpoint);
	}

	return new OllamaRequestError("Ollama request failed", "unknown", endpoint);
}

function buildGenerateBody(
	config: OllamaConfig,
	prompt: string,
	format?: object | "json",
	temperature?: number,
): string {
	const disableThinking = config.disableThinking ?? true;
	return JSON.stringify({
		model: config.model,
		prompt,
		stream: false,
		think: disableThinking ? false : undefined,
		...(format ? { format } : {}),
		...(temperature !== undefined ? { options: { temperature } } : {}),
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
		temperature,
		maxRetries = OLLAMA_MAX_RETRIES,
		retryBaseDelayMs = OLLAMA_RETRY_BASE_DELAY_MS,
		timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS,
	} = options;

	let lastError: OllamaRequestError | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const body = buildGenerateBody(config, prompt, format, temperature);
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
				timeoutMs,
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

			if (typeof data.response !== "string") {
				throw new OllamaRequestError(
					`Ollama returned invalid response type: ${typeof data.response} (expected string). Full response: ${JSON.stringify(data)}`,
					"invalid_response",
					config.endpoint,
				);
			}

			if (data.response.trim() === "") {
				if (context === "resolver") {
					console.warn(
						`[Ollama] Empty response for resolver request with format: ${format ? JSON.stringify(format) : "none"}`,
					);
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
			// A timeout means the model is stalled or overloaded; retrying
			// would only multiply the wait, so fail fast as well.
			if (lastError.code === "empty_response" || lastError.code === "timeout") {
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
		timeoutMs: OLLAMA_HEALTHCHECK_TIMEOUT_MS,
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
			OLLAMA_CONNECTIVITY_TIMEOUT_MS,
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
