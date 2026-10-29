import {
	COMMANDS,
	COMMAND_TYPES,
	CommandType,
	TOPIC_IDS,
} from "../domain/commands/CommandDefinitions";
import { NamedEntity, WorldView } from "./WorldView";

/**
 * The two prompts the resolver can send: the one that turns a sentence into a
 * command, and the one that settles which of a few things a name means.
 */

/** Names only: enough for the model to recognise a thing it has no id to give for. */
const namesOf = (entities: NamedEntity[]): string => entities.map((e) => e.name).join(", ");

const listOf = (entities: NamedEntity[]): string =>
	entities
		.map(
			(e) =>
				`${e.id} = ${e.name}${e.aliases?.length ? ` (also "${e.aliases.join('", "')}")` : ""}`,
		)
		.join("; ");

function playerNote(name: string): string {
	return `The player character is called "${name}". A sentence in the third person such as "${name} goes to the library" or "${name} rests" describes what the player does; ${name} is not someone to talk to.`;
}

/** What the player can see and name right now: closed lists of ids to choose from. */
function worldSection(view: WorldView): string {
	const lines = [
		`The player is in the ${view.location.name}.`,
		`Places they can reach from here (id = name): ${listOf(view.exits) || "none"}.`,
		`Other places in the game: ${listOf(view.places.filter((p) => !view.exits.some((e) => e.id === p.id) && p.id !== view.location.id)) || "none"}.`,
		`People here right now (id = name): ${listOf(view.peopleHere) || "nobody"}.`,
		`Other people in the game: ${namesOf(view.people.filter((p) => !view.peopleHere.some((h) => h.id === p.id))) || "none"}.`,
		`Subjects (id = name): ${listOf(view.subjects)}.${view.classNow ? ` The class being held now is ${view.classNow.name}.` : ""}`,
		`Spells the player has learned (id = name): ${listOf(view.spells.filter((s) => s.learned)) || "none"}.`,
		`Other spells: ${namesOf(view.spells.filter((s) => !s.learned)) || "none"}.`,
		`Items the player has (id = name): ${listOf(view.items) || "none"}.`,
	];
	if (view.recent.length > 0) {
		lines.push(
			`What the player did most recently (newest last):\n${view.recent
				.map((turn) => `- "${turn.input}" → ${turn.summary}`)
				.join("\n")}\nThe words him, her, them, it, there and that mean the most recent matching thing above: answer with its id.`,
		);
	}
	return lines.join("\n");
}

/** The commands the model may answer with, from the definitions table. */
function commandList(): string {
	return COMMAND_TYPES.filter((type: CommandType) => COMMANDS[type].modelFacing)
		.map((type) => {
			const definition = COMMANDS[type];
			const target = definition.target ? ` Target field: "${definition.target.field}".` : "";
			return `- ${type}: ${definition.summary}${target}`;
		})
		.join("\n");
}

const RULES = `Rules:
- Going, walking, entering or visiting any place in the game is MOVE, even if its name sounds like a class or like a person ("Hagrid's hut" is a place, not Hagrid). Going to a lesson, class or lecture of a subject ("go to the potions lecture", "go to transfiguration class") is ATTEND_CLASS, not MOVE.
- Greeting, talking to or asking a person is TALK, never INTERACT. Studying, revising or reading up on a subject is STUDY. PRACTICE is only for casting a spell; INTERACT is only for using an item.
- For a target field, give the id from the lists when the player clearly means one of the entries, otherwise copy the player's own words for it.
- If the player did not say which place, person, subject, spell or item, leave the target field out. Never guess one, and never repeat the command word as the target. (The words him, her, them, it, there and that are the exception: they mean the most recent matching thing, if the recent actions below show one.)
- Include "duration" only if the player says how long, as a whole number of hours. Include "conversationTopic" only if the sentence is about one of these topics: ${TOPIC_IDS.join(", ")}.
- If the sentence is not a command, answer {"type": "UNKNOWN"}.`;

/**
 * One sentence in, one command out. `view` is absent when the resolver has no
 * game to look at.
 *
 * The parts that never change (instructions, commands, rules) come first and
 * what changes every turn (the player, the world, the sentence) comes last, so
 * the model server can reuse its work on the unchanged start of the prompt.
 */
export function buildCommandPrompt(input: string, view?: WorldView): string {
	return `You turn one sentence from the player of a fantasy school RPG into a single game command.

Commands:
${commandList()}

${RULES}
${view ? `\n${playerNote(view.playerName)}\n\n${worldSection(view)}\n` : ""}
User input: "${input}"

Respond with only one JSON object: the command's "type" and the fields it needs.`;
}

/** Asked only when a name is ambiguous: which of these few things does it mean? */
export function buildPickPrompt(
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
