import { z } from "zod";
import { Command } from "../../ui/cli/commands/Command";
import { OllamaConfig } from "./OllamaConfig";
import { generateWithOllama, OLLAMA_RESOLVER_TIMEOUT_MS } from "./OllamaClient";
import {
	INTENT_TYPES,
	IntentType,
	IntentResponseSchema,
	ARGUMENT_SCHEMAS,
	ParsedArguments,
} from "./ResolverSchemas";

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

class Resolver {
	private config: OllamaConfig;

	constructor(config: OllamaConfig) {
		this.config = config;
	}

	/**
	 * Resolves free-form player input into a structured `Command` using a
	 * two-stage pipeline:
	 *   1. Intent parsing — classify the input into one of a small, fixed
	 *      set of intents (cheap, single-field JSON response).
	 *   2. Argument parsing — given the intent, extract only the fields
	 *      relevant to that intent, validated with Zod.
	 *
	 * Both stages use `format: "json"` (basic JSON mode), which is reliably
	 * supported by all Ollama models. Zod validates and coerces the response;
	 * a repair pass handles nested or loosely-structured output.
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
		const parsed = await this._generate(prompt, IntentResponseSchema, OLLAMA_RESOLVER_TIMEOUT_MS);
		return parsed.intent;
	}

	private async _extractArguments(
		input: string,
		intent: IntentType,
	): Promise<ParsedArguments> {
		const schema = ARGUMENT_SCHEMAS[intent];
		if (!schema) return {};

		const prompt = this._buildArgumentPrompt(input, intent);
		return (await this._generate(prompt, schema, OLLAMA_RESOLVER_TIMEOUT_MS)) as ParsedArguments;
	}

	/**
	 * Requests JSON from Ollama and validates the response with the given Zod
	 * schema. On validation failure, attempts a repair pass before giving up:
	 *
	 *  1. Direct parse + Zod validate.
	 *  2. Deep-flatten (lifts nested keys to top level) + re-validate.
	 *     Handles responses like `{ data: { intent: "MOVE" } }`.
	 *  3. Enum-scan repair for `invalid_value` issues: finds the first string
	 *     value anywhere in the response that matches an allowed enum value.
	 *  4. Throw — outer `resolve()` returns `{ type: "REST" }`.
	 */
	private async _generate<T>(
		prompt: string,
		schema: z.ZodType<T>,
		timeoutMs?: number,
	): Promise<T> {
		const responseText = await generateWithOllama(this.config, prompt, {
			context: "resolver",
			format: "json",
			timeoutMs,
		});

		let parsed: unknown;
		try {
			parsed = JSON.parse(responseText);
		} catch {
			throw new Error(`Ollama returned non-JSON response: "${responseText}"`);
		}

		// 1. Direct validate
		const direct = schema.safeParse(parsed);
		if (direct.success) {
			// If schema allows an empty object (e.g. all-optional fields), try
			// flatten repair once to recover nested fields like { result: { duration: 2 } }.
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				!Array.isArray(parsed) &&
				typeof direct.data === "object" &&
				direct.data !== null &&
				!Array.isArray(direct.data) &&
				Object.keys(direct.data as Record<string, unknown>).length === 0 &&
				Object.keys(parsed as Record<string, unknown>).length > 0
			) {
				const flattened = this._deepFlatten(parsed);
				const flattenedResult = schema.safeParse(flattened);
				if (
					flattenedResult.success &&
					Object.keys(flattenedResult.data as Record<string, unknown>).length > 0
				) {
					console.debug(
						"[Resolver] Repaired via deep-flatten after empty direct parse:",
						flattenedResult.data,
					);
					return flattenedResult.data;
				}
			}
			return direct.data;
		}

		// 2. Deep-flatten repair
		console.warn("[Resolver] Zod validation failed; attempting repair");
		const flattened = this._deepFlatten(parsed);
		const afterFlatten = schema.safeParse(flattened);
		if (afterFlatten.success) {
			console.debug("[Resolver] Repaired via deep-flatten:", afterFlatten.data);
			return afterFlatten.data;
		}

		// 3. Enum-scan repair for remaining invalid_value issues
		const enumRepaired = this._repairEnumFields(parsed, schema, afterFlatten.error.issues);
		if (enumRepaired !== undefined) {
			console.debug("[Resolver] Repaired via enum scan:", enumRepaired);
			return enumRepaired;
		}

		throw new Error(
			`Zod validation failed: ${afterFlatten.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
		);
	}

	/**
	 * Recursively merges all nested object keys into a single flat object.
	 * Shallower (top-level) keys win on collision so the model's top-level
	 * answer is preferred over anything buried inside.
	 */
	private _deepFlatten(value: unknown): Record<string, unknown> {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
		const obj = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const v of Object.values(obj)) {
			if (typeof v === "object" && v !== null && !Array.isArray(v)) {
				Object.assign(result, this._deepFlatten(v));
			}
		}
		Object.assign(result, obj); // top-level keys overwrite nested
		return result;
	}

	/**
	 * For each `invalid_value` issue (Zod v4 enum failure), scans all string
	 * values in the original parsed response for a match against the allowed
	 * values, then re-validates the patched object.
	 */
	private _repairEnumFields<T>(
		parsed: unknown,
		schema: z.ZodType<T>,
		issues: z.ZodIssue[],
	): T | undefined {
		const enumIssues = issues.filter(
			(i) =>
				i.code === "invalid_value" &&
				i.path.length === 1 &&
				Array.isArray((i as { values?: unknown }).values),
		);
		if (enumIssues.length === 0) return undefined;

		const allStrings = this._collectAllStrings(parsed);
		const patch: Record<string, unknown> = {
			...(typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}),
		};

		for (const issue of enumIssues) {
			const key = String(issue.path[0]);
			const allowed = (issue as { values: string[] }).values;
			const found = allStrings.find((s) => allowed.includes(s));
			if (found) patch[key] = found;
		}

		const result = schema.safeParse(patch);
		return result.success ? result.data : undefined;
	}

	private _collectAllStrings(value: unknown): string[] {
		if (typeof value === "string") return [value];
		if (typeof value !== "object" || value === null) return [];
		return Object.values(value as Record<string, unknown>).flatMap((v) =>
			this._collectAllStrings(v),
		);
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
