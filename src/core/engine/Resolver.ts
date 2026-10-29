import { parseFastPath } from "./FastPath";
import { z } from "zod";
import { Command } from "./Command";
import { OllamaConfig } from "../../ai/OllamaConfig";
import {
	generateWithOllama,
	OLLAMA_RESOLVER_TIMEOUT_MS,
} from "../../ai/OllamaClient";
import Registry from "../Registry";
import { CLEAR_MATCH_SCORE, RankedMatch, rankCandidates } from "./EntityMatcher";
import {
	INTENT_TYPES,
	IntentType,
	IntentResponseSchema,
	PickResponseSchema,
	ARGUMENT_SCHEMAS,
	ParsedArguments,
} from "./ResolverSchemas";
import {
	NamedEntity,
	WorldView,
	buildStaticWorldView,
} from "./WorldView";

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

/** How many candidates the model is shown when a name is ambiguous. */
const MAX_PICK_CANDIDATES = 5;
/** With no name match, offer everyone only while the cast is this small. */
const MAX_OFFER_ALL = 12;

class Resolver {
	private config: OllamaConfig;

	/**
	 * With a `registry`, names the player types are grounded in the world:
	 * a `TALK` target is matched against the known NPCs instead of being
	 * trusted as an id. Without one, targets are passed through unchanged.
	 */
	constructor(
		config: OllamaConfig,
		private registry?: Registry,
	) {
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
	async resolve(input: string, view?: WorldView): Promise<Command> {
		const fast = parseFastPath(input);
		if (fast) {
			console.debug(`[Resolver] "${input}" → fast path → ${JSON.stringify(fast)}`);
			return fast;
		}

		try {
			// Without a view the resolver still knows the content, just not
			// where the player is or who is here.
			const world =
				view ?? (this.registry ? buildStaticWorldView(this.registry) : undefined);
			const intent = await this._classifyIntent(input, world);

			if (intent === "ADVANCE_YEAR") {
				console.debug(`[Resolver] "${input}" → intent=ADVANCE_YEAR`);
				return { type: "ADVANCE_YEAR" };
			}

			const args = await this._extractArguments(input, intent, world);
			if (args.target && world) {
				args.target = await this._groundTarget(intent, input, args.target, world);
			}
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
			return { type: "UNKNOWN", input };
		}
	}

	private async _classifyIntent(
		input: string,
		view?: WorldView,
	): Promise<IntentType> {
		const prompt = this._buildIntentPrompt(input, view);
		const parsed = await this._generate(
			prompt,
			IntentResponseSchema,
			OLLAMA_RESOLVER_TIMEOUT_MS,
		);
		return parsed.intent;
	}

	private async _extractArguments(
		input: string,
		intent: IntentType,
		view?: WorldView,
	): Promise<ParsedArguments> {
		const schema = ARGUMENT_SCHEMAS[intent];
		if (!schema) return {};

		const prompt = this._buildArgumentPrompt(input, intent, view);
		return (await this._generate(
			prompt,
			schema,
			OLLAMA_RESOLVER_TIMEOUT_MS,
		)) as ParsedArguments;
	}

	/**
	 * Which things the extracted text can refer to for this intent. `preferred`
	 * is the small, relevant set (where the player can go from here, who is
	 * here, spells they know); `all` is everything of that kind, so a miss can
	 * still be refused with the right reason ("not from here", "not learned").
	 */
	private _targetsFor(
		intent: IntentType,
		view: WorldView,
	): { label: string; all: NamedEntity[]; preferred: NamedEntity[] } | null {
		switch (intent) {
			case "MOVE":
				return { label: "place", all: view.places, preferred: view.exits };
			case "TALK":
				return { label: "character", all: view.people, preferred: view.peopleHere };
			case "STUDY":
			case "ATTEND_CLASS":
				return {
					label: "subject",
					all: view.subjects,
					preferred: view.classNow ? [view.classNow] : [],
				};
			case "PRACTICE":
				return {
					label: "spell",
					all: view.spells,
					preferred: view.spells.filter((spell) => spell.learned),
				};
			case "INTERACT":
				return { label: "item", all: view.items, preferred: view.items };
			default:
				return null;
		}
	}

	private async _groundTarget(
		intent: IntentType,
		input: string,
		text: string,
		view: WorldView,
	): Promise<string> {
		const targets = this._targetsFor(intent, view);
		if (!targets || targets.all.length === 0) return text;
		return this._ground(targets.label, input, text, targets.all, targets.preferred);
	}

	/**
	 * Turns the text the model extracted ("the library in main building",
	 * "Rubeus", "wingardium leviosa") into the id of a real thing. The model's
	 * answer is never trusted as an id on its own:
	 *   1. a single clear match among the `preferred` things wins;
	 *   2. else a single clear match among `all` of that kind (so the turn
	 *      rules can give the right refusal);
	 *   3. else the model chooses from a short list (the best matches, or the
	 *      small preferred set) and only an id from that list is accepted;
	 *   4. else the player's text is returned unchanged, so the rules can say
	 *      what was not found.
	 */
	private async _ground(
		label: string,
		input: string,
		text: string,
		all: NamedEntity[],
		preferred: NamedEntity[],
	): Promise<string> {
		const rank = (entities: NamedEntity[]) =>
			rankCandidates(
				text,
				entities.map((entity) => ({
					id: entity.id,
					names: [entity.id, entity.name],
					aliases: entity.aliases ?? [],
				})),
			);

		const inPreferred = clearWinner(rank(preferred));
		if (inPreferred) return inPreferred;

		const ranked = rank(all);
		const inAll = clearWinner(ranked);
		if (inAll) return inAll;

		const offeredIds =
			ranked.length > 0
				? ranked.slice(0, MAX_PICK_CANDIDATES).map((m) => m.id)
				: preferred.length > 0
					? preferred.map((entity) => entity.id)
					: all.length <= MAX_OFFER_ALL
						? all.map((entity) => entity.id)
						: [];
		if (offeredIds.length === 0) return text;

		const offered = all.filter((entity) => offeredIds.includes(entity.id));
		try {
			const pick = await this._generate(
				this._buildPickPrompt(label, input, text, offered),
				PickResponseSchema,
				OLLAMA_RESOLVER_TIMEOUT_MS,
			);
			if (offeredIds.includes(pick.id)) return pick.id;
		} catch (error) {
			console.warn(
				`[Resolver] Could not pick a ${label} for "${text}": ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
		return text;
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
	 *  4. Throw — outer `resolve()` returns `{ type: "UNKNOWN" }`, which the
	 *     engine reports to the player without spending any time.
	 */
	private async _generate<T>(
		prompt: string,
		schema: z.ZodType<T>,
		timeoutMs?: number,
	): Promise<T> {
		const responseText = await generateWithOllama(this.config, prompt, {
			context: "resolver",
			// Constrain the reply to the schema so the model cannot invent keys.
			format: jsonSchemaFor(schema),
			timeoutMs,
		});

		let parsed: unknown;
		try {
			parsed = JSON.parse(responseText);
		} catch {
			throw new Error(
				`Ollama returned non-JSON response: "${responseText}"`,
			);
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
				Object.keys(direct.data as Record<string, unknown>).length ===
					0 &&
				Object.keys(parsed as Record<string, unknown>).length > 0
			) {
				const flattened = this._deepFlatten(parsed);
				const flattenedResult = schema.safeParse(flattened);
				if (
					flattenedResult.success &&
					Object.keys(flattenedResult.data as Record<string, unknown>)
						.length > 0
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
			console.debug(
				"[Resolver] Repaired via deep-flatten:",
				afterFlatten.data,
			);
			return afterFlatten.data;
		}

		// 3. Enum-scan repair for remaining invalid_value issues
		const enumRepaired = this._repairEnumFields(
			parsed,
			schema,
			afterFlatten.error.issues,
		);
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
		if (typeof value !== "object" || value === null || Array.isArray(value))
			return {};
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
			...(typeof parsed === "object" && parsed !== null
				? (parsed as Record<string, unknown>)
				: {}),
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

	private _buildIntentPrompt(input: string, view?: WorldView): string {
		const intentList = INTENT_TYPES.map(
			(intent) => `- ${intent}: ${INTENT_SUMMARIES[intent]}`,
		).join("\n");

		return `You are an intent classifier for a fantasy RPG game. Classify the following user input into exactly one of the available intents.

Available intents:
${intentList}
${view ? `\n${playerNote(view.playerName)}\n${placeNote(view)}\n` : ""}
User input: "${input}"

Respond with only valid JSON containing the single best-matching intent.`;
	}

	private _buildPickPrompt(
		label: string,
		input: string,
		text: string,
		offered: NamedEntity[],
	): string {
		const list = offered
			.map((entity) => {
				const aliases = entity.aliases?.length
					? `, also called ${entity.aliases.map((a) => `"${a}"`).join(" or ")}`
					: "";
				const description = entity.description ? ` (${entity.description})` : "";
				return `- ${entity.id}: ${entity.name}${description}${aliases}`;
			})
			.join("\n");

		return `You are matching a name for a fantasy RPG. The player's input mentions a ${label}; the words extracted from their input were "${text}".

Options:
${list}

User input: "${input}"

Choose the one option the player most likely means. Respond with only valid JSON like {"id": "<id from the list>"}, or {"id": "none"} if none of them fits.`;
	}

	private _buildArgumentPrompt(
		input: string,
		intent: IntentType,
		view?: WorldView,
	): string {
		const world = view ? worldLines(intent, view) : "";
		const duration =
			'Include "duration" only if the player says how long, as a whole number of hours; otherwise leave it out.';
		const help: Record<IntentType, string> = {
			MOVE: '{"target": "<the place the player wants to go to>"}',
			TALK: '{"target": "<the person to talk to>", "conversationTopic": "<what about, only if said>"}',
			STUDY: `{"target": "<the subject>", "duration": <hours>}. ${duration}`,
			ATTEND_CLASS: `{"target": "<the subject of the class>", "duration": <hours>}. ${duration}`,
			PRACTICE: `{"target": "<the spell>", "duration": <hours>}. ${duration}`,
			INTERACT: '{"target": "<the item>", "actionType": "<what to do with it, only if said>"}',
			REST: `{"duration": <hours>}. ${duration}`,
			SAVE: '{"target": "<save name, only if said>"}',
			LOAD: '{"target": "<save name, only if said>"}',
			ADVANCE_YEAR: "{}",
		};

		return `You are an argument extractor for a fantasy RPG game. The user's input has already been classified as a "${intent}" command (${INTENT_SUMMARIES[intent]}).
${view ? `\n${playerNote(view.playerName)}\n` : ""}${world}
User input: "${input}"

Respond with only valid JSON of this shape: ${help[intent]}
${world ? 'For "target", give the id from the list when the player clearly means one of the entries, otherwise copy the player\'s own words for it.' : ""}`;
	}

	private _createCommand(intent: IntentType, rawArgs: ParsedArguments): Command {
		const args = { ...rawArgs, duration: sanitiseDuration(rawArgs.duration) };
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

/** One candidate beats the rest: a name, not a guess. */
function clearWinner(ranked: RankedMatch[]): string | undefined {
	const [best, second] = ranked;
	if (
		best &&
		best.score >= CLEAR_MATCH_SCORE &&
		(!second || (best.score === 1 && second.score < 1))
	) {
		return best.id;
	}
	return undefined;
}

function playerNote(name: string): string {
	return `The player character is called "${name}". A sentence in the third person such as "${name} goes to the library" or "${name} rests" describes what the player does; ${name} is not someone to talk to.`;
}

/**
 * Going to a place is MOVE even when its name sounds like something else
 * ("the classroom", "Hagrid's hut"); attending the lesson itself is not.
 */
function placeNote(view: WorldView): string {
	const names = view.places.map((p) => p.name).join(", ");
	return `Places in the game: ${names}. Going, walking, entering or visiting any of these places is MOVE, even if the name sounds like a class or a person. ATTEND_CLASS is only for attending the lesson itself.`;
}

const listOf = (entities: NamedEntity[]): string =>
	entities
		.map((e) => `${e.id} = ${e.name}${e.aliases?.length ? ` (also "${e.aliases.join('", "')}")` : ""}`)
		.join("; ");

/** The closed lists that help the model answer with real ids, per intent. */
function worldLines(intent: IntentType, view: WorldView): string {
	switch (intent) {
		case "MOVE":
			return `The player is in the ${view.location.name}. Places they can reach from here (id = name): ${listOf(view.exits) || "none"}.\nOther places in the game: ${listOf(view.places.filter((p) => !view.exits.some((e) => e.id === p.id) && p.id !== view.location.id))}.\n`;
		case "TALK":
			return `People here right now (id = name): ${listOf(view.peopleHere) || "nobody"}.\nOther people in the game: ${listOf(view.people.filter((p) => !view.peopleHere.some((h) => h.id === p.id)))}.\n`;
		case "STUDY":
		case "ATTEND_CLASS":
			return `Subjects (id = name): ${listOf(view.subjects)}.${view.classNow ? ` The class being held now is ${view.classNow.name}.` : ""}\n`;
		case "PRACTICE":
			return `Spells the player has learned (id = name): ${listOf(view.spells.filter((s) => s.learned)) || "none"}.\nOther spells (id = name): ${listOf(view.spells.filter((s) => !s.learned))}.\n`;
		case "INTERACT":
			return `Items the player has (id = name): ${listOf(view.items) || "none"}.\n`;
		default:
			return "";
	}
}

/** The reply is constrained to the schema; plain JSON mode is the fallback. */
function jsonSchemaFor(schema: z.ZodType): object | "json" {
	try {
		return z.toJSONSchema(schema) as object;
	} catch {
		return "json";
	}
}

/** Hours must be a sane whole number; anything else is dropped so the default applies. */
function sanitiseDuration(duration: number | undefined): number | undefined {
	return duration !== undefined && Number.isFinite(duration) && duration >= 1 && duration <= 24
		? Math.round(duration)
		: undefined;
}

export default Resolver;
