import type { OllamaConfig } from "../../ai/OllamaConfig";

/**
 * Scripted stand-in for `generateWithOllama`, for tests that run the real
 * Resolver -> TurnResolver -> Renderer pipeline without a model.
 *
 * Install with `jest.mock` in the test file (see golden-path.test.ts) and
 * script the player's lines with `scriptPlayer`. The fake dispatches on
 * `options.context`:
 *   - "resolver": answers the intent stage, the argument stage and, when the
 *     Resolver is unsure which character is meant, the pick stage, from the
 *     script, keyed by the raw player input echoed in the prompt.
 *   - "renderer": returns a fixed narration string.
 *   - anything else (blueprint generation): rejects, so callers take their
 *     deterministic fallback path.
 */

export const FAKE_NARRATION = "NARRATION";

export interface ScriptedLine {
	intent: string;
	args?: Record<string, unknown>;
	/** Answer to the "which of these do you mean" call; defaults to "none". */
	pick?: string;
}

const script = new Map<string, ScriptedLine>();

/** Every prompt the narrator was given, oldest first. */
export const rendererPrompts: string[] = [];

/** The most recent prompt the narrator was given. */
export function lastRendererPrompt(): string {
	return rendererPrompts[rendererPrompts.length - 1] ?? "";
}

/** Player inputs the Resolver asked about that had no script entry. */
export const unscriptedInputs: string[] = [];

export function scriptPlayer(input: string, line: ScriptedLine): void {
	script.set(input, line);
}

export function resetFakeOllama(): void {
	script.clear();
	unscriptedInputs.length = 0;
	rendererPrompts.length = 0;
}

export async function fakeGenerateWithOllama(
	_config: OllamaConfig,
	prompt: string,
	options: { context?: string } = {},
): Promise<string> {
	switch (options.context) {
		case "resolver":
			return answerResolver(prompt);
		case "renderer":
			rendererPrompts.push(prompt);
			return FAKE_NARRATION;
		default:
			throw new Error(
				`fakeOllama: no fake for context "${options.context}"`,
			);
	}
}

function answerResolver(prompt: string): string {
	const input = /User input: "(.*)"/.exec(prompt)?.[1] ?? "";
	const line = script.get(input);
	if (!line) {
		unscriptedInputs.push(input);
		throw new Error(`fakeOllama: no script for player input "${input}"`);
	}

	if (prompt.startsWith("You are an intent classifier")) {
		return JSON.stringify({ intent: line.intent });
	}
	if (prompt.startsWith("You are matching a name")) {
		return JSON.stringify({ id: line.pick ?? "none" });
	}
	return JSON.stringify(line.args ?? {});
}
