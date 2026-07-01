import { Command } from "../../ui/cli/commands/Command";
import { OllamaConfig } from "./OllamaConfig";
import { generateWithOllama } from "./OllamaClient";

/** All command intents the parser can recognize. */
const INTENT_TYPES = [
	"MOVE",
	"TALK",
	"STUDY",
	"ATTEND_CLASS",
	"PRACTICE",
	"INTERACT",
	"REST",
	"SAVE",
	"LOAD",
	"ADVANCE_YEAR",
] as const;

type IntentType = (typeof INTENT_TYPES)[number];

/** One-line summaries used to help the model pick the right intent. */
const INTENT_SUMMARIES: Record<IntentType, string> = {
	MOVE: 'Navigate to a location (e.g., "go to village", "travel north")',
	TALK: 'Interact with an NPC (e.g., "talk to goblin", "chat with merchant")',
	STUDY: 'Study a subject on your own (e.g., "study charms", "learn potions")',
	ATTEND_CLASS:
		'Attend a scheduled class (e.g., "attend charms class", "go to potions lecture")',
	PRACTICE:
		'Practice a learned spell (e.g., "practice fireball", "rehearse the shield charm")',
	INTERACT: 'Use an item (e.g., "use potion", "open door")',
	REST: 'Rest and advance time (e.g., "rest", "sleep 2 hours")',
	SAVE: 'Save the game (e.g., "save game1")',
	LOAD: 'Load a saved game (e.g., "load game1")',
	ADVANCE_YEAR:
		'Advance to the next school year (e.g., "advance to next year", "end the school year")',
};

/** Flattened argument shape returned by the second-stage extraction call. */
interface ParsedArguments {
	target?: string;
	duration?: number;
	conversationTopic?: string;
	actionType?: string;
}

/** Per-intent JSON schema for the argument-extraction call. `null` means no arguments are needed. */
const ARGUMENT_SCHEMAS: Record<IntentType, object | null> = {
	MOVE: {
		type: "object",
		properties: {
			target: {
				type: "string",
				description: "The destination location id",
			},
		},
		required: ["target"],
	},
	TALK: {
		type: "object",
		properties: {
			target: { type: "string", description: "The NPC id to talk to" },
			conversationTopic: {
				type: "string",
				description: "The topic of conversation, if one is mentioned",
			},
		},
		required: ["target"],
	},
	STUDY: {
		type: "object",
		properties: {
			target: { type: "string", description: "The subject id to study" },
			duration: {
				type: "number",
				description: "Hours to study, default 1",
			},
		},
		required: ["target"],
	},
	ATTEND_CLASS: {
		type: "object",
		properties: {
			target: {
				type: "string",
				description: "The subject id for the class",
			},
			duration: {
				type: "number",
				description: "Hours to attend, default 1",
			},
		},
		required: ["target"],
	},
	PRACTICE: {
		type: "object",
		properties: {
			target: { type: "string", description: "The spell id to practice" },
			duration: {
				type: "number",
				description: "Hours to practice, default 1",
			},
		},
		required: ["target"],
	},
	INTERACT: {
		type: "object",
		properties: {
			target: {
				type: "string",
				description: "The item id to interact with",
			},
			actionType: {
				type: "string",
				description: 'The action to perform, e.g. "use" or "open"',
			},
		},
		required: ["target"],
	},
	REST: {
		type: "object",
		properties: {
			target: {
				type: "string",
				description: "The location id to rest at, if specified",
			},
			duration: {
				type: "number",
				description: "Hours to rest, default 1",
			},
		},
	},
	SAVE: {
		type: "object",
		properties: {
			target: { type: "string", description: "The save filename" },
		},
	},
	LOAD: {
		type: "object",
		properties: {
			target: { type: "string", description: "The filename to load" },
		},
	},
	// ADVANCE_YEAR takes no arguments, so no second LLM call is needed for it.
	ADVANCE_YEAR: null,
};

class Resolver {
	private config: OllamaConfig;
	private intentSchema = {
		type: "object",
		properties: {
			intent: {
				type: "string",
				enum: INTENT_TYPES as unknown as string[],
				description: "The single best-matching command intent",
			},
		},
		required: ["intent"],
	};

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	/**
	 * Resolves free-form player input into a structured `Command` using a
	 * two-stage pipeline:
	 *   1. Intent parsing - classify the input into one of a small, fixed
	 *      set of intents (cheap, single-field JSON response).
	 *   2. Argument parsing - given the intent, extract only the fields
	 *      relevant to that intent using a narrowly scoped schema.
	 *
	 * Splitting the work this way keeps each individual LLM call small and
	 * focused, which is both faster and more consistent than asking a
	 * single call to pick a type AND fill in a large union of possible
	 * fields at once.
	 */
	async resolve(input: string): Promise<Command> {
		try {
			const intent = await this._classifyIntent(input);

			if (intent === "ADVANCE_YEAR") {
				console.debug(`[Resolver] "${input}" → intent=ADVANCE_YEAR`);
				return { type: "ADVANCE_YEAR" };
			}

			const args = await this._extractArguments(input, intent);
			const command = this._createCommand(intent, args);

			console.debug(
				`[Resolver] "${input}" → intent=${intent} → ${JSON.stringify(command)}`,
			);
			return command;
		} catch (error) {
			console.error(
				`[Resolver] Failed to resolve "${input}": ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
			return { type: "REST", duration: 1 };
		}
	}

	private async _classifyIntent(input: string): Promise<IntentType> {
		const prompt = this._buildIntentPrompt(input);
		const parsed = (await this._generate(prompt, this.intentSchema)) as {
			intent?: string;
		};

		const intent = parsed.intent as IntentType;
		if (!INTENT_TYPES.includes(intent)) {
			throw new Error(`Unrecognized intent: ${parsed.intent}`);
		}
		return intent;
	}

	private async _extractArguments(
		input: string,
		intent: IntentType,
	): Promise<ParsedArguments> {
		const schema = ARGUMENT_SCHEMAS[intent];
		if (!schema) {
			return {};
		}

		const prompt = this._buildArgumentPrompt(input, intent);
		return (await this._generate(prompt, schema)) as ParsedArguments;
	}

	private async _generate(prompt: string, format: object): Promise<unknown> {
		const responseText = await generateWithOllama(this.config, prompt, {
			context: "resolver",
			format,
		});
		return JSON.parse(responseText);
	}

	private _buildIntentPrompt(input: string): string {
		const intentList = INTENT_TYPES.map(
			(intent) => `- ${intent}: ${INTENT_SUMMARIES[intent]}`,
		).join("\n");

		return `You are an intent classifier for a fantasy RPG game. Classify the following user input into exactly one of the available intents.

Available intents:
${intentList}

User input: "${input}"

Respond with only valid JSON containing the single best-matching intent.`;
	}

	private _buildArgumentPrompt(input: string, intent: IntentType): string {
		return `You are an argument extractor for a fantasy RPG game. The user's input has already been classified as a "${intent}" command (${INTENT_SUMMARIES[intent]}).

User input: "${input}"

Extract only the fields relevant to this command. Respond with only valid JSON.`;
	}

	private _createCommand(intent: IntentType, args: ParsedArguments): Command {
		switch (intent) {
			case "MOVE":
				return {
					type: "MOVE",
					destinationId: args.target ?? "unknown",
				};
			case "TALK":
				return {
					type: "TALK",
					npcId: args.target ?? "unknown",
					conversationTopic: args.conversationTopic,
				};
			case "STUDY":
				return {
					type: "STUDY",
					subjectId: (args.target ?? "charms") as any,
					duration: args.duration ?? 1,
				};
			case "ATTEND_CLASS":
				return {
					type: "ATTEND_CLASS",
					subjectId: args.target ?? "unknown",
					duration: args.duration ?? 1,
				};
			case "PRACTICE":
				return {
					type: "PRACTICE",
					spellId: args.target ?? "unknown",
					duration: args.duration ?? 1,
				};
			case "INTERACT":
				return {
					type: "INTERACT",
					itemId: args.target ?? "unknown",
					actionType: args.actionType ?? "use",
				};
			case "REST":
				return {
					type: "REST",
					duration: args.duration ?? 1,
					locationId: args.target,
				};
			case "SAVE":
				return {
					type: "SAVE",
					filename: args.target ?? "autosave",
				};
			case "LOAD":
				return {
					type: "LOAD",
					filename: args.target ?? "autosave",
				};
			case "ADVANCE_YEAR":
				return { type: "ADVANCE_YEAR" };
		}
	}
}

export default Resolver;
