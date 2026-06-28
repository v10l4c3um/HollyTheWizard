import { Command } from "../../ui/cli/commands/Command";
import { MoveCommand } from "../../ui/cli/commands/Move";
import { TalkCommand } from "../../ui/cli/commands/Talk";
import { StudyCommand } from "../../ui/cli/commands/Study";
import { InteractCommand } from "../../ui/cli/commands/Interact";
import { RestCommand } from "../../ui/cli/commands/Rest";
import { SaveCommand } from "../../ui/cli/commands/Save";
import { LoadCommand } from "../../ui/cli/commands/Load";

interface ParsedCommand {
	type: string;
	target?: string;
	params?: Record<string, unknown>;
}

class Resolver {
	private ollamaEndpoint: string = "http://localhost:11434/api/generate";
	private model: string = "ollama";
	private commandSchema = {
		type: "object",
		properties: {
			type: {
				type: "string",
				enum: [
					"MOVE",
					"TALK",
					"STUDY",
					"INTERACT",
					"REST",
					"SAVE",
					"LOAD",
				],
				description: "The command type",
			},
			target: {
				type: "string",
				description:
					"The target (NPC name, location, spell, item, etc.)",
			},
			params: {
				type: "object",
				properties: {
					direction: { type: "string" },
					duration: { type: "number" },
					filename: { type: "string" },
					actionType: { type: "string" },
					location: { type: "string" },
				},
				additionalProperties: true,
			},
		},
		required: ["type"],
	};

	async resolve(input: string): Promise<Command> {
		const prompt = this._buildPrompt(input);

		try {
			const response = await fetch(this.ollamaEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.model,
					prompt: prompt,
					stream: false,
					format: this.commandSchema,
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Ollama request failed: ${response.statusText}`,
				);
			}

			const data = await response.json();
			const parsed = JSON.parse(data.response) as ParsedCommand;

			return this._createCommand(parsed);
		} catch (error) {
			throw new Error(
				`Failed to resolve command: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private _buildPrompt(input: string): string {
		return `You are a command parser for a fantasy RPG game. Parse the following user input into a structured command.

Available commands:
- MOVE: Navigate to locations (e.g., "go to village", "travel north")
- TALK: Interact with NPCs (e.g., "talk to goblin", "chat with merchant")
- STUDY: Learn spells or gain knowledge (e.g., "study fireball", "learn magic")
- INTERACT: Use items or examine objects (e.g., "use potion", "open door")
- REST: Heal and advance time (e.g., "rest", "sleep 2 hours")
- SAVE: Save the game (e.g., "save game1")
- LOAD: Load a saved game (e.g., "load game1")

User input: "${input}"

Extract the command type, target (if applicable), and any parameters. Respond with only valid JSON.`;
	}

	private _createCommand(parsed: ParsedCommand): Command {
		const { type, target, params } = parsed;

		switch (type) {
			case "MOVE":
				return new MoveCommand(
					target || "unknown",
					(params?.distance as number) || 1,
				);
			case "TALK":
				return new TalkCommand(
					target || "someone",
					params?.conversationTopic as string | undefined,
				);
			case "STUDY":
				return new StudyCommand(
					target || "unknown spell",
					(params?.duration as number) || 1,
				);
			case "INTERACT":
				return new InteractCommand(
					target || "object",
					(params?.actionType as string) || "use",
				);
			case "REST":
				return new RestCommand(
					(params?.duration as number) || 1,
					(params?.location as string) || "current location",
				);
			case "SAVE":
				return new SaveCommand(
					(params?.filename as string) || target || "autosave",
				);
			case "LOAD":
				return new LoadCommand(
					(params?.filename as string) || target || "autosave",
				);
			default:
				throw new Error(`Unknown command type: ${type}`);
		}
	}
}

export default Resolver;
