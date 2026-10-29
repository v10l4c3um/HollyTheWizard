/** Where diagnostics go. Never the terminal: the Ink UI owns it. */
export interface Logger {
	error(message: string, cause?: unknown): void;
}
