import { Command } from "../domain/commands/CommandDefinitions";
import { WorldView } from "./WorldView";

/**
 * Sentences that only make sense after another one: "again", "go back". They
 * are read from the remembered turns, with no language model, like the fast
 * path. Strict on purpose: anything else is a normal sentence.
 *
 *   again | repeat [that] | do that again | the same [again] | once more
 *   back | go back [there] | head back | return
 */
export function parseFollowUp(
	input: string,
	view: Pick<WorldView, "recent">,
): Command | null {
	const text = input
		.trim()
		.toLowerCase()
		.replace(/[.!?]+$/, "")
		.replace(/\s+/g, " ");

	if (REPEAT.test(text)) {
		const last = view.recent[view.recent.length - 1];
		return last
			? (JSON.parse(JSON.stringify(last.command)) as Command)
			: { type: "UNKNOWN", input, hint: "There is nothing to repeat yet." };
	}

	if (BACK.test(text)) {
		const lastMove = [...view.recent].reverse().find((t) => t.command.type === "MOVE");
		return lastMove
			? { type: "MOVE", destinationId: lastMove.fromLocationId }
			: { type: "UNKNOWN", input, hint: "You haven't gone anywhere yet." };
	}

	return null;
}

const REPEAT =
	/^(again|repeat( (that|it))?|do (that|it|the same)( thing)?( again)?|(the )?same( thing)?( again)?|once more|one more time)$/;

const BACK = /^((go|walk|head|get|come) )?back( there)?$|^return$/;
