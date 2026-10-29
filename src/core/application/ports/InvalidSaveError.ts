/**
 * A save file that cannot be used: unreadable JSON, a different format version,
 * a missing or wrong-typed part, or (checked after loading) content the game no
 * longer has. There is no repair: the player is told what is wrong.
 */
export class InvalidSaveError extends Error {
	constructor(
		readonly filename: string,
		readonly problems: string[],
	) {
		const shown = problems.slice(0, 3).join("; ");
		const more =
			problems.length > 3 ? ` (and ${problems.length - 3} more)` : "";
		super(`Save '${filename}' can't be used: ${shown}${more}`);
		this.name = "InvalidSaveError";
	}
}
