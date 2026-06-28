type CommandType =
	| "move"
	| "study"
	| "practice"
	| "rest"
	| "talk"
	| "inspect"
	| "help"
	| "save"
	| "load"
	| "unknown";

interface ParsedCommand {
	type: CommandType;
	args: string[];
	raw: string;
}

class CommandParser {
	private static readonly COMMAND_ALIASES: Record<string, CommandType> = {
		// Movement
		go: "move",
		move: "move",
		travel: "move",
		explore: "move",

		// Learning
		study: "study",
		learn: "study",

		// Spell practice
		practice: "practice",
		cast: "practice",

		// Rest
		rest: "rest",
		sleep: "rest",

		// Social
		talk: "talk",
		speak: "talk",
		chat: "talk",

		// Inventory
		inspect: "inspect",
		inventory: "inspect",
		inv: "inspect",
		spellbook: "inspect",

		// Meta
		help: "help",
		"?": "help",
		save: "save",
		load: "load",
	};

	static parse(input: string): ParsedCommand {
		const trimmed = input.trim();
		const parts = trimmed.split(/\s+/);
		const commandWord = parts[0].toLowerCase();
		const args = parts.slice(1);

		const type = CommandParser.COMMAND_ALIASES[commandWord] || "unknown";

		return {
			type,
			args,
			raw: trimmed,
		};
	}

	static getHelpText(): string {
		return `
Available commands:
  move <location>     - Travel to a connected location
  study               - Study your spells and subjects
  practice <spell>    - Practice a spell you're learning
  rest                - Rest and restore energy
  talk <npc>          - Speak with an NPC
  inspect [subject]   - View your inventory or spellbook
  save <filename>     - Save your game
  load <filename>     - Load a saved game
  help                - Show this help text
  quit/exit           - Exit the game
`;
	}
}

export { CommandParser, ParsedCommand, CommandType };
