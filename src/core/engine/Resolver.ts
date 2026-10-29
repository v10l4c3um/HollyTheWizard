import { z } from "zod";
import { COMMANDS, Command, CommandReply, CommandReplySchema, LenientCommandReplySchema, TargetKind } from "../domain/commands/CommandDefinitions";
import { OllamaConfig } from "../../ai/OllamaConfig";
import {
	generateWithOllama,
	OLLAMA_RESOLVER_TIMEOUT_MS,
} from "../../ai/OllamaClient";
import Registry from "../Registry";
import { CLEAR_MATCH_SCORE, RankedMatch, rankCandidates } from "./EntityMatcher";
import { parseFastPath } from "./FastPath";
import { parseFollowUp } from "./FollowUp";
import { buildCommand, cleanReply, givenTarget, isEcho } from "./CommandSemantics";
import { buildCommandPrompt, buildPickPrompt } from "./ResolverPrompts";
import { NamedEntity, WorldView, buildStaticWorldView } from "./WorldView";
import { Logger, silentLogger } from "../application/ports/Logger";

/** Zod schema for "which of these options does the player mean?". */
const PickResponseSchema = z.object({ id: z.string() });

/** How many candidates the model is shown when a name is ambiguous. */
const MAX_PICK_CANDIDATES = 5;
/** With no name match, offer everyone only while the cast is this small. */
const MAX_OFFER_ALL = 12;

interface Grounded {
	value: string;
	/** `value` is the id of a real thing (not the player's own words). */
	matched: boolean;
}

/**
 * Turns what the player typed into a typed `Command`.
 *
 *   1. `parseFastPath`   save / load / undo, exactly as typed. No model.
 *   2. `parseFollowUp`   "again", "go back". No model.
 *   3. One call to the model: the whole command, as a single JSON object held
 *      to a schema (`CommandReplySchema`, derived from the definitions table).
 *   4. `cleanReply`      drops what cannot be right and resolves "her", "there".
 *   5. Grounding         the target is matched against the game's places,
 *      people, subjects, spells and items; the model is asked once more only
 *      if that is ambiguous.
 *   6. `buildCommand`    real defaults, or `UNKNOWN` with the question to ask.
 *
 * Any failure ends in `UNKNOWN`, which the engine reports without spending time.
 */
class Resolver {
	/**
	 * With a `registry`, names the player types are grounded in the world even
	 * when no `WorldView` is passed. Without one, targets are passed through.
	 */
	constructor(
		private config: OllamaConfig,
		private registry?: Registry,
		private logger: Logger = silentLogger,
	) {}

	async resolve(input: string, view?: WorldView): Promise<Command> {
		const fast = parseFastPath(input);
		if (fast) {
			this.logger.debug(`[Resolver] "${input}" → fast path → ${JSON.stringify(fast)}`);
			return fast;
		}

		const followUp = view ? parseFollowUp(input, view) : null;
		if (followUp) {
			this.logger.debug(`[Resolver] "${input}" → follow-up → ${JSON.stringify(followUp)}`);
			return followUp;
		}

		try {
			// Without a view the resolver still knows the content, just not
			// where the player is or who is here.
			const world = view ?? (this.registry ? buildStaticWorldView(this.registry) : undefined);

			const reply = await this._ask(input, world);
			const cleaned = cleanReply(reply, input, world);
			const grounded = await this._groundReply(cleaned, input, world);
			const command = buildCommand(grounded, input);

			this.logger.debug(`[Resolver] "${input}" → ${JSON.stringify(command)}`);
			return command;
		} catch (error) {
			this.logger.error(
				`[Resolver] Failed to resolve "${input}": ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
			return { type: "UNKNOWN", input };
		}
	}

	/** The one call: the whole command as JSON, read leniently. */
	private async _ask(input: string, world?: WorldView): Promise<CommandReply> {
		const text = await generateWithOllama(this.config, buildCommandPrompt(input, world), {
			context: "resolver",
			// Constrain the reply to the schema so the model cannot invent keys or types.
			format: jsonSchemaFor(CommandReplySchema),
			// Reading a command is not creative: the same input should give the same parse.
			temperature: 0,
			timeoutMs: OLLAMA_RESOLVER_TIMEOUT_MS,
			logger: this.logger,
		});

		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new Error(`Ollama returned non-JSON response: "${text}"`);
		}
		const result = LenientCommandReplySchema.safeParse(parsed);
		if (!result.success) {
			throw new Error(
				`Not a command: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
			);
		}
		return result.data as CommandReply;
	}

	/** Matches the reply's target (a place, a person, …) against the game. */
	private async _groundReply(
		reply: CommandReply,
		input: string,
		world?: WorldView,
	): Promise<CommandReply> {
		const target = COMMANDS[reply.type].target;
		const given = target ? givenTarget(reply[target.field]) : undefined;
		if (!target || !given || !world) return reply;

		const things = this._thingsOf(target.kind, world);
		if (things.all.length === 0) return reply;

		const grounded = await this._ground(target.kind, input, given, things.all, things.preferred);
		// The model repeated the player's whole sentence ("go" -> "go") and it is
		// not a real thing: that is no target at all.
		const value = !grounded.matched && isEcho(given, input) ? undefined : grounded.value;
		return { ...reply, [target.field]: value };
	}

	/**
	 * Everything of a kind, and the small relevant set among it (where the
	 * player can go from here, who is here, spells they know). `all` lets a
	 * miss still be refused with the right reason ("not from here", "not learned").
	 */
	private _thingsOf(
		kind: TargetKind,
		view: WorldView,
	): { all: NamedEntity[]; preferred: NamedEntity[] } {
		switch (kind) {
			case "place":
				return { all: view.places, preferred: view.exits };
			case "person":
				return { all: view.people, preferred: view.peopleHere };
			case "subject":
				return { all: view.subjects, preferred: view.classNow ? [view.classNow] : [] };
			case "spell":
				return { all: view.spells, preferred: view.spells.filter((s) => s.learned) };
			case "item":
				return { all: view.items, preferred: view.items };
		}
	}

	// TODO(resolution-step): this ladder could be replaced by a dedicated LLM
	// call over all candidates of the kind, with EntityMatcher kept as a free
	// pre-filter and as the check on the model's answer. See "Rework ideas" in
	// docs/systems/03-intent-resolver.md.
	/**
	 * Turns the text the model gave ("the library in main building", "Rubeus",
	 * "wingardium leviosa") into the id of a real thing. The model's answer is
	 * never trusted as an id on its own:
	 *   1. a single clear match among the `preferred` things wins;
	 *   2. else a single clear match among `all` of that kind (so the turn
	 *      rules can give the right refusal);
	 *   3. else the model chooses from a short list (the best matches, or the
	 *      small preferred set) and only an id from that list is accepted;
	 *   4. else the player's text is returned unchanged, so the rules can say
	 *      what was not found.
	 */
	private async _ground(
		kind: TargetKind,
		input: string,
		text: string,
		all: NamedEntity[],
		preferred: NamedEntity[],
	): Promise<Grounded> {
		const rank = (entities: NamedEntity[]) =>
			rankCandidates(
				text,
				entities.map((entity) => ({
					id: entity.id,
					names: [entity.id, entity.name],
					aliases: entity.aliases ?? [],
				})),
			);

		// The player's own sentence names a thing outright ("practice alohomora"):
		// that wins over whatever id the model answered with.
		const named = clearWinner(
			rankCandidates(
				input,
				all.map((entity) => ({
					id: entity.id,
					names: [entity.id, entity.name],
					aliases: entity.aliases ?? [],
				})),
			),
		);
		if (named) return { value: named, matched: true };

		const inPreferred = clearWinner(rank(preferred));
		if (inPreferred) return { value: inPreferred, matched: true };

		const ranked = rank(all);
		const inAll = clearWinner(ranked);
		if (inAll) return { value: inAll, matched: true };

		const offeredIds =
			ranked.length > 0
				? ranked.slice(0, MAX_PICK_CANDIDATES).map((m) => m.id)
				: preferred.length > 0
					? preferred.map((entity) => entity.id)
					: all.length <= MAX_OFFER_ALL
						? all.map((entity) => entity.id)
						: [];
		if (offeredIds.length === 0) return { value: text, matched: false };

		const offered = all.filter((entity) => offeredIds.includes(entity.id));
		try {
			const pick = await this._pick(buildPickPrompt(LABEL[kind], input, text, offered));
			if (offeredIds.includes(pick.id)) return { value: pick.id, matched: true };
		} catch (error) {
			this.logger.warn(
				`[Resolver] Could not pick a ${LABEL[kind]} for "${text}": ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
		return { value: text, matched: false };
	}

	private async _pick(prompt: string): Promise<{ id: string }> {
		const text = await generateWithOllama(this.config, prompt, {
			context: "resolver",
			format: jsonSchemaFor(PickResponseSchema),
			temperature: 0,
			timeoutMs: OLLAMA_RESOLVER_TIMEOUT_MS,
			logger: this.logger,
		});
		return PickResponseSchema.parse(JSON.parse(text));
	}
}

const LABEL: Record<TargetKind, string> = {
	place: "place",
	person: "character",
	subject: "subject",
	spell: "spell",
	item: "item",
};

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

/** The reply is constrained to the schema; plain JSON mode is the fallback. */
function jsonSchemaFor(schema: z.ZodType): object | "json" {
	try {
		return z.toJSONSchema(schema) as object;
	} catch {
		return "json";
	}
}

export default Resolver;
