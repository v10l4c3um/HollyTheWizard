import { Command } from "../domain/commands/CommandDefinitions";

export const QUICKSAVE_SLOT = "quicksave";
export const AUTOSAVE_SLOT = "autosave";

const SLOT_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Commands whose meaning is fully fixed by the text are parsed here, without
 * the language model: instant, works offline and cannot be misread. The rules
 * are deliberately strict; anything that does not fit exactly returns `null`
 * and goes to the model like any other sentence ("save the day" must stay a
 * sentence).
 *
 *   save | save game | save [game] [as|to] <name>
 *   load | load game | load [game] [from] <name>
 *   undo
 */
export function parseFastPath(input: string): Command | null {
	const words = input.trim().split(/\s+/);
	const verb = words[0]?.toLowerCase();
	if (verb === "undo") return words.length === 1 ? { type: "UNDO" } : null;
	if (verb !== "save" && verb !== "load") return null;

	const rest = words.slice(1);
	if (rest[0]?.toLowerCase() === "game") rest.shift();

	const fillers = verb === "save" ? ["as", "to"] : ["from"];
	const hasFiller = rest.length > 0 && fillers.includes(rest[0].toLowerCase());
	if (hasFiller) rest.shift();

	if (rest.length === 0) {
		// A bare "save as" / "load from" is missing its name: not ours.
		if (hasFiller) return null;
		return verb === "save"
			? { type: "SAVE", filename: QUICKSAVE_SLOT }
			: {
					type: "LOAD",
					filename: QUICKSAVE_SLOT,
					fallbackFilename: AUTOSAVE_SLOT,
				};
	}

	if (rest.length === 1 && SLOT_NAME.test(rest[0])) {
		return verb === "save"
			? { type: "SAVE", filename: rest[0] }
			: { type: "LOAD", filename: rest[0] };
	}

	return null;
}
