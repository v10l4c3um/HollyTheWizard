import Registry from "../../Registry";
import TurnResolver from "../TurnResolver";
import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { CommandHandler } from "./types";

/** In-world actions: the deterministic rules decide, the narrator describes. */
export function createTurnHandler(
	turnResolver: TurnResolver,
	registry: Registry,
): CommandHandler<InWorldCommand> {
	return async (command, session) => {
		const result = turnResolver.apply(command, session.state, registry);
		return {
			kind: "narrate",
			briefOutput: result.briefOutput,
			timePassed: result.timePassed,
		};
	};
}
