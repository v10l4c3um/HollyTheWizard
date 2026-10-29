import {
	COMMANDS,
	Command,
	CommandReply,
	CommandType,
	TargetKind,
} from "../domain/commands/CommandDefinitions";
import { TOPICS } from "../domain/npc/TopicRegistry";
import { AUTOSAVE_SLOT, QUICKSAVE_SLOT } from "./FastPath";
import { normalizeName } from "./EntityMatcher";
import { NamedEntity, WorldView } from "./WorldView";

/**
 * What a reply from the model means for the game, checked before it becomes a
 * command. Pure functions: the model proposes, this decides.
 *
 *   cleanReply    drops what cannot be right (a made-up duration or topic, a
 *                 guessed target) and resolves "him" / "there" / "it"
 *   buildCommand  fills the real defaults and builds the typed command, or
 *                 `UNKNOWN` with the question that asks for what is missing
 *
 * Matching a target against the game's places, people and so on needs the
 * model once more when it is ambiguous, so that step lives in `Resolver`
 * between the two.
 */

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

export const MIN_HOURS = 1;
export const MAX_HOURS = 24;

/** A whole number of hours from 1 to 24, or nothing (so the default of one hour applies). */
export function sanitiseDuration(duration: unknown): number | undefined {
	const hours = typeof duration === "string" ? Number(duration) : duration;
	return typeof hours === "number" &&
		Number.isFinite(hours) &&
		hours >= MIN_HOURS &&
		hours <= MAX_HOURS
		? Math.round(hours)
		: undefined;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Words a model writes when there is nothing to put in a target. */
const NON_ANSWERS = new Set(["none", "unknown", "n/a", "na", "null", "nothing", "undefined", "-"]);

/** The target the player named, or undefined if it is blank or a non-answer. */
export function givenTarget(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return !trimmed || NON_ANSWERS.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

/**
 * Words that carry no target: command verbs, articles, prepositions, numbers
 * and filler. A sentence with nothing else left names no place, person,
 * subject, spell or item. Deliberately short: an unlisted word counts as
 * content, which only means the model's answer is kept.
 */
const NO_TARGET_WORDS = new Set(
	`a an the to into in on at of for from with about up down over out off
	 go goes going went walk walks walking move moves moving travel head heads heading visit visits visiting enter enters entering
	 talk talks talking speak speaks speaking chat chats chatting greet greets greeting say says hello hi ask asks asking
	 study studies studying learn learns learning revise revises revising read reads reading
	 attend attends attending practice practise practices practises practicing practising rehearse rehearses rehearsing cast casts casting
	 use uses using open opens opening take takes taking
	 i me my we let lets please want would like need try
	 hour hours minute minutes while some bit little long
	 one two three four five six seven eight nine ten eleven twelve
	 another more again also too just`
		.split(/\s+/)
		.filter(Boolean),
);

/** Words that point back at something said or done earlier. */
const PRONOUNS = new Set([
	"him", "her", "them", "he", "she", "they", "it", "its", "there", "that", "this", "one",
	"that one", "that person", "that place", "the same", "the same one",
]);

const words = (text: string): string[] => normalizeName(text).split(" ").filter(Boolean);

/** The sentence names something beyond command words and pronouns. */
export function mentionsAnything(input: string): boolean {
	return words(input).some(
		(word) => !/^\d+$/.test(word) && !NO_TARGET_WORDS.has(word) && !PRONOUNS.has(word),
	);
}

function hasPronoun(input: string): boolean {
	return words(input).some((word) => PRONOUNS.has(word));
}

/** What "him", "there" or "it" means for this kind of target: the newest matching thing. */
export function lastReferent(kind: TargetKind, view: WorldView): NamedEntity | undefined {
	switch (kind) {
		case "person":
			return view.lastPerson;
		case "place":
			return view.lastPlace;
		case "subject":
			return view.lastSubject;
		case "spell":
			return view.lastSpell;
		case "item":
			return view.lastItem;
	}
}

/** The model repeated the player's whole sentence ("go" → "go"): that is no target. */
export function isEcho(target: string, input: string): boolean {
	return normalizeName(target) === normalizeName(input);
}

// ---------------------------------------------------------------------------
// The reply
// ---------------------------------------------------------------------------

/**
 * Removes or fixes what cannot be right in the model's reply.
 *  - a target the sentence cannot contain (only command words) is dropped;
 *  - pronouns ("her", "there", "it") become the newest matching thing, or nothing;
 *  - a duration outside 1–24 whole hours is dropped;
 *  - a conversation topic the game does not know is dropped.
 */
export function cleanReply(
	reply: CommandReply,
	input: string,
	view?: WorldView,
): CommandReply {
	const out: CommandReply = { ...reply };
	const target = COMMANDS[reply.type].target;

	if (target) {
		let value = givenTarget(out[target.field]);
		if (!mentionsAnything(input)) {
			// "talk to him", "go there": the newest thing, never whatever the model found nearby.
			value = hasPronoun(input) && view ? lastReferent(target.kind, view)?.id : undefined;
		} else if (value && PRONOUNS.has(normalizeName(value))) {
			value = view ? lastReferent(target.kind, view)?.id : undefined;
		}
		// The model leaves a pronoun's target out ("ask her about it"): the newest
		// matching thing fills it in.
		if (!value && view && hasPronoun(input)) value = lastReferent(target.kind, view)?.id;
		out[target.field] = value;
	}

	if ("duration" in out) out.duration = sanitiseDuration(out.duration);
	if (typeof out.conversationTopic === "string" && !(out.conversationTopic in TOPICS)) {
		delete out.conversationTopic;
	}
	if ("actionType" in out) {
		const verb = typeof out.actionType === "string" ? out.actionType.trim() : "";
		if (verb) out.actionType = verb;
		else delete out.actionType;
	}
	return out;
}

/**
 * Builds the typed command. A target the player never gave is not replaced by
 * a guess: the result is an `UNKNOWN` that asks for it. The defaults that
 * remain are real ones: one hour, the verb "use", and the quick-save slot (the
 * same slots as the fast path's bare "save" / "load").
 */
export function buildCommand(reply: CommandReply, input: string): Command {
	const type = reply.type as CommandType;
	const targetDef = COMMANDS[type].target;
	const target = targetDef ? givenTarget(reply[targetDef.field]) : undefined;
	if (targetDef && !target) {
		return { type: "UNKNOWN", input, hint: targetDef.missingHint };
	}

	const hours = typeof reply.duration === "number" ? reply.duration : undefined;
	const filename = givenTarget(reply.filename);

	switch (type) {
		case "MOVE":
			return { type, destinationId: target! };
		case "TALK": {
			const topic = typeof reply.conversationTopic === "string" ? reply.conversationTopic : undefined;
			return topic
				? { type, npcId: target!, conversationTopic: topic }
				: { type, npcId: target! };
		}
		case "STUDY":
		case "ATTEND_CLASS":
			return { type, subjectId: target!, duration: hours ?? 1 };
		case "PRACTICE":
			return { type, spellId: target!, duration: hours ?? 1 };
		case "INTERACT":
			return {
				type,
				itemId: target!,
				actionType: typeof reply.actionType === "string" ? reply.actionType : "use",
			};
		case "REST":
			return { type, duration: hours ?? 1 };
		case "SAVE":
			return { type, filename: filename ?? QUICKSAVE_SLOT };
		case "LOAD":
			return filename
				? { type, filename }
				: { type, filename: QUICKSAVE_SLOT, fallbackFilename: AUTOSAVE_SLOT };
		case "ADVANCE_YEAR":
			return { type };
		case "UNDO":
			return { type };
		case "UNKNOWN":
			return { type, input };
		default: {
			const unreachable: never = type;
			return { type: "UNKNOWN", input, hint: String(unreachable) };
		}
	}
}
