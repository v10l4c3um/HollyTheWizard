export interface OllamaConfig {
	endpoint: string;
	model: string;
	debugMode?: boolean;
}

const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434/api/generate";

export const DEFAULT_RESOLVER_OLLAMA_CONFIG: OllamaConfig = {
	endpoint: DEFAULT_OLLAMA_ENDPOINT,
	model: "hf.co/llmware/qwen3-4b-instruct-gguf:Q4_K_M",
	debugMode: true,
};

export const DEFAULT_RENDERER_OLLAMA_CONFIG: OllamaConfig = {
	endpoint: DEFAULT_OLLAMA_ENDPOINT,
	model: "llama3.1:8b-instruct-q4_K_M",
	debugMode: true,
};

export const DEFAULT_BLUEPRINT_OLLAMA_CONFIG: OllamaConfig = {
	endpoint: DEFAULT_OLLAMA_ENDPOINT,
	model: "llama3.1:8b-instruct-q4_K_M",
	debugMode: true,
};

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: DEFAULT_RESOLVER_OLLAMA_CONFIG.model,
	debugMode: true,
};
