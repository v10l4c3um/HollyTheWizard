import Registry from "../../Registry";
import { Command } from "../Command";
import TurnResolver from "../TurnResolver";
import { createMetaHandlers, MetaHandlerDeps } from "./metaHandlers";
import { createTurnHandler } from "./turnHandler";
import { GameSession } from "../GameSession";
import { CommandHandler, CommandHandlerMap, HandlerResult } from "./types";

export type { CommandHandlerMap, HandlerResult } from "./types";
export { GameSession } from "../GameSession";

export interface CommandHandlerDeps extends MetaHandlerDeps {
	turnResolver: TurnResolver;
	registry: Registry;
}

export function createCommandHandlers(
	deps: CommandHandlerDeps,
): CommandHandlerMap {
	const turn = createTurnHandler(deps.turnResolver, deps.registry);
	return {
		...createMetaHandlers(deps),
		MOVE: turn,
		TALK: turn,
		STUDY: turn,
		ATTEND_CLASS: turn,
		PRACTICE: turn,
		INTERACT: turn,
		REST: turn,
	};
}

/** Looks up the handler for `command` and runs it. */
export function runCommand(
	handlers: CommandHandlerMap,
	command: Command,
	session: GameSession,
): Promise<HandlerResult> {
	// The map is keyed by command type, so the entry always accepts `command`.
	const handler = handlers[command.type] as CommandHandler<Command>;
	return handler(command, session);
}
