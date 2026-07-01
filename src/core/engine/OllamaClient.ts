import { OllamaConfig } from "./OllamaConfig";

export const OLLAMA_REQUEST_TIMEOUT_MS = 5000;
export const OLLAMA_HEALTHCHECK_TIMEOUT_MS = 10000;
export const OLLAMA_CONNECTIVITY_TIMEOUT_MS = 1000;
export const OLLAMA_MAX_RETRIES = 3;
export const OLLAMA_RETRY_BASE_DELAY_MS = 250;

type OllamaRequestErrorCode =
	| "timeout"
	| "unavailable"
	| "http"
	| "invalid_response"
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
	timeoutMs: number,
): Promise<Response> {
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
			const response = await fetchWithTimeout(
				config.endpoint,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: buildGenerateBody(config, prompt, format),
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
					"Ollama returned an invalid response",
					"invalid_response",
					config.endpoint,
				);
			}

			return data.response;
		} catch (error) {
			lastError = normalizeError(error, config.endpoint);
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
