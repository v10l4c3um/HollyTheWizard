import { GameSession } from "../GameSession";
import { Command } from "../Command";
import { TimePassed } from "../TurnResult";
import { TurnError } from "../TurnOutcome";

/**
 * What a handler asks the engine to do next. The engine owns everything after
 * that: rendering, milestone checks and building the outcome.
 */
export type { GameSession };

export type HandlerResult =
	/** Narrate this fact with the LLM renderer. */
	| { kind: "narrate"; briefOutput: string; timePassed?: TimePassed }
	/** Show this exact text; no narration. */
	| { kind: "say"; text: string }
	/** The command did not work; nothing is narrated or checked. */
	| { kind: "fail"; error: TurnError };

export type CommandHandler<C extends Command> = (
	command: C,
	session: GameSession,
) => Promise<HandlerResult>;

/** The compiler requires an entry for every command type. */
export type CommandHandlerMap = {
	[K in Command["type"]]: CommandHandler<Extract<Command, { type: K }>>;
};
