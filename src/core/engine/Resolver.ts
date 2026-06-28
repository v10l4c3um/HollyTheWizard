import { Command } from "../../types";
import { OllamaConfig } from "./OllamaConfig";

interface ParsedCommand {
	type: string;
	target?: string;
	params?: Record<string, unknown>;
}

class Resolver {
	private config: OllamaConfig;
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
				description: "The target id (NPC, location, spell, item, etc.)",
			},
			params: {
				type: "object",
				properties: {
					duration: { type: "number" },
					filename: { type: "string" },
					actionType: { type: "string" },
					conversationTopic: { type: "string" },
				},
				additionalProperties: true,
			},
		},
		required: ["type"],
	};

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	async resolve(input: string): Promise<Command> {
		const prompt = this._buildPrompt(input);

		try {
			const response = await fetch(this.config.endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.config.model,
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

			const data = await response.json() as { response: string };
			const parsed = JSON.parse(data.response) as ParsedCommand;

			const command = this._createCommand(parsed);

			console.debug(`[Resolver] "${input}" → ${JSON.stringify(command)}`);
			return command;
		} catch (error) {
			throw new Error(
				`Failed to resolve command: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	private _buildPrompt(input: string): string {
		return `You are a command parser for a fantasy RPG game. Parse the following user input into a structured command.

Available commands:
- MOVE: Navigate to a location (e.g., "go to village", "travel north")
- TALK: Interact with an NPC (e.g., "talk to goblin", "chat with merchant")
- STUDY: Study a spell (e.g., "study fireball", "learn magic")
- INTERACT: Use an item (e.g., "use potion", "open door")
- REST: Rest and advance time (e.g., "rest", "sleep 2 hours")
- SAVE: Save the game (e.g., "save game1")
- LOAD: Load a saved game (e.g., "load game1")

User input: "${input}"

Extract the command type, the target id (if applicable), and any parameters. Respond with only valid JSON.`;
	}

	private _createCommand(parsed: ParsedCommand): Command {
		const { type, target, params } = parsed;

		switch (type) {
			case "MOVE":
				return { type: "MOVE", destinationId: target ?? "unknown" };
			case "TALK":
				return {
					type: "TALK",
					npcId: target ?? "unknown",
					conversationTopic: params?.conversationTopic as
						| string
						| undefined,
				};
			case "STUDY":
				return {
					type: "STUDY",
					spellId: target ?? "unknown",
					duration: (params?.duration as number | undefined) ?? 1,
				};
			case "INTERACT":
				return {
					type: "INTERACT",
					itemId: target ?? "unknown",
					actionType:
						(params?.actionType as string | undefined) ?? "use",
				};
			case "REST":
				return {
					type: "REST",
					duration: (params?.duration as number | undefined) ?? 1,
					locationId: params?.location as string | undefined,
				};
			case "SAVE":
				return {
					type: "SAVE",
					filename:
						(params?.filename as string | undefined) ??
						target ??
						"autosave",
				};
			case "LOAD":
				return {
					type: "LOAD",
					filename:
						(params?.filename as string | undefined) ??
						target ??
						"autosave",
				};
			default:
				throw new Error(`Unknown command type: ${type}`);
		}
	}
}

export default Resolver;
