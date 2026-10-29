import type { Command } from "../commands/CommandDefinitions";

/** How many past turns the game remembers, for "again", "go back" and "ask her". */
export const MAX_RECENT_TURNS = 5;

/** One in-world turn the player took, as the game understood it. */
export interface RecentTurn {
	/** What the player typed. */
	input: string;
	/** What it was understood as. */
	command: Command;
	/** Where the player was when they did it. */
	fromLocationId: string;
}
