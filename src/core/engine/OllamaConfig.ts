export interface OllamaConfig {
	endpoint: string;
	model: string;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "llama3.1:8b-instruct-q4_K_M",
};
