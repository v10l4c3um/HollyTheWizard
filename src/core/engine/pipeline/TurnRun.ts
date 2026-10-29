import GameState from "../../domain/world/GameState";
import { Command } from "../../domain/commands/CommandDefinitions";
import { GameSession } from "../GameSession";
import { HandlerResult } from "../handlers";
import { TickReport } from "../WorldTick";
import { TurnError } from "../TurnOutcome";
import { TurnResult } from "../TurnResult";

/**
 * Everything the stages of one turn share. A stage reads what the earlier ones
 * left here and adds its own part; a stage that sets `error` ends the turn.
 */
export interface TurnRun {
	input: string;
	command: Command;
	session: GameSession;
	/** The state the turn began on; if `session.state` is another object, a `LOAD` replaced it. */
	working: GameState;
	clockBefore: number;
	fromLocationId: string;

	/** What the command's handler answered. */
	decision?: HandlerResult;
	/** The rule's result, for an in-world command. */
	turn?: TurnResult;
	/** What the world did while time passed. */
	report?: TickReport;
	error?: TurnError;
}

/** The state was swapped during the turn (a load): there is no "before" to compare with. */
export function stateReplaced(run: TurnRun): boolean {
	return run.session.state !== run.working;
}

export interface TurnStage {
	name: string;
	run(run: TurnRun): void | Promise<void>;
}
