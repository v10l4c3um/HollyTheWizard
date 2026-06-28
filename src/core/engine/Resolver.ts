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
				},
				additionalProperties: true,
			},
		},
		required: ["type"],
	};

	async resolve(input: string): Promise<CommandSchema> {
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
			const parsed = JSON.parse(data.response) as CommandSchema;

			return this._validateCommand(parsed);
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

	private _validateCommand(command: unknown): CommandSchema {
		if (typeof command !== "object" || command === null) {
			throw new Error("Invalid command format");
		}

		const cmd = command as Record<string, unknown>;

		if (!cmd.type || typeof cmd.type !== "string") {
			throw new Error("Command must have a type");
		}

		const validTypes = [
			"MOVE",
			"TALK",
			"STUDY",
			"INTERACT",
			"REST",
			"SAVE",
			"LOAD",
		];
		if (!validTypes.includes(cmd.type)) {
			throw new Error(`Invalid command type: ${cmd.type}`);
		}

		return {
			type: cmd.type as CommandSchema["type"],
			target: typeof cmd.target === "string" ? cmd.target : undefined,
			params:
				typeof cmd.params === "object"
					? (cmd.params as Record<string, unknown>)
					: undefined,
		};
	}
}

export default Resolver;
