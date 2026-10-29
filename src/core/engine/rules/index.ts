import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { TurnResult } from "../TurnResult";
import { TurnContext } from "./context";
import { attendClass } from "./attendClass";
import { interact } from "./interact";
import { move } from "./move";
import { practice } from "./practice";
import { rest } from "./rest";
import { study } from "./study";
import { talk } from "./talk";

export type { TurnContext } from "./context";

export type TurnRule<C extends InWorldCommand> = (command: C, ctx: TurnContext) => TurnResult;

/**
 * The rules of the world, one per in-world command. A new in-world command
 * without an entry here does not compile.
 */
export const turnRules: {
	[K in InWorldCommand["type"]]: TurnRule<Extract<InWorldCommand, { type: K }>>;
} = {
	MOVE: move,
	TALK: talk,
	STUDY: study,
	ATTEND_CLASS: attendClass,
	PRACTICE: practice,
	INTERACT: interact,
	REST: rest,
};
