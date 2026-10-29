/**
 * Where diagnostics go. Never the terminal: the Ink UI owns it, so a stray
 * `console.log` corrupts the screen. `detail` is anything worth keeping with
 * the message (an error, a request body).
 */
export interface Logger {
	debug(message: string, detail?: unknown): void;
	warn(message: string, detail?: unknown): void;
	error(message: string, detail?: unknown): void;
}

/** Does nothing; the default wherever a logger is optional, so nothing reaches the terminal. */
export const silentLogger: Logger = { debug() {}, warn() {}, error() {} };
