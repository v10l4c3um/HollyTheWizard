import { TurnFact } from "../domain/facts/TurnFact";

/**
 * The English wording of what happened in a turn. Rules return `TurnFact`s and
 * never sentences; everything a player or the renderer reads about a turn's
 * outcome is worded here, so changing the voice or the language is a change to
 * this file alone.
 */

const names = (refs: { name: string }[]) => refs.map((r) => r.name).join(", ");

function exitsText(from: string, exits: string[]): string {
	return exits.length > 0
		? `From ${from} you can go to: ${exits.join(", ")}.`
		: `There is nowhere to go from ${from} yet.`;
}

/** The sentence the player (and the narrator) is told. */
export function describeFact(fact: TurnFact): string {
	switch (fact.kind) {
		case "moved":
			return `You traveled to ${fact.to.name}.`;
		case "move-blocked":
			return `You can't move to ${fact.to.name} from ${fact.from.name}. ${exitsText(fact.from.name, fact.exits)}`;
		case "conversation":
			return describeConversation(fact);
		case "studied": {
			let text = `You studied ${fact.subject.name}. Gained +${fact.gain} knowledge.`;
			if (fact.revealed.length > 0) text += ` New spells available: ${names(fact.revealed)}!`;
			return text;
		}
		case "attended": {
			let text = `Attended ${fact.subject.name}: "${fact.lesson.title}". ${fact.lesson.topic}.`;
			if (fact.gains.length > 0) {
				text += ` Knowledge: ${fact.gains.map((g) => `+${g.amount} ${g.subject}`).join(", ")}.`;
			}
			const onlyKnownOf = fact.revealed.filter((r) => !fact.learned.some((l) => l.id === r.id));
			if (fact.learned.length > 0) text += ` Learned: ${names(fact.learned)}!`;
			if (onlyKnownOf.length > 0) text += ` New spells available: ${names(onlyKnownOf)}!`;
			return text;
		}
		case "practiced": {
			const tier = fact.tier.charAt(0).toUpperCase() + fact.tier.slice(1);
			return `You practiced ${fact.spell.name} ${fact.attempts} times. Success: ${fact.successes}/${fact.attempts}. Proficiency: ${Math.round(fact.proficiency)}/100 (${tier}).`;
		}
		case "interacted":
			return `You ${fact.verb} ${fact.item.name}. Something happened!`;
		case "rested":
			return `You rested for ${fact.hours} hour(s) at ${fact.place.name}. You feel refreshed!`;
		case "year-advanced":
			return `You have advanced to Year ${fact.to}. A new chapter begins.`;
		case "refused":
			return describeRefusal(fact);
	}
}

function describeConversation(fact: Extract<TurnFact, { kind: "conversation" }>): string {
	const npc = fact.npc.name;
	const about = fact.topic ? ` about ${fact.topic}` : "";
	switch (fact.result) {
		case "success":
			return `You had a pleasant conversation with ${npc}${about}.`;
		case "partial":
			return `${npc} answered cautiously${about}. You learned something, though not everything.`;
		case "refusal":
			return `${npc} refused to engage${about}. The conversation ended poorly.`;
		case "deflection":
			return `${npc} deflected your question${about} with practiced ease.`;
		case "reveal":
			return `${npc} opened up${about}. You learned something significant.`;
		case "invitation":
			return `${npc} suggested meeting again${about}. An invitation has been extended.`;
	}
}

function describeRefusal(fact: Extract<TurnFact, { kind: "refused" }>): string {
	switch (fact.reason) {
		case "nowhere":
			return "You seem to be nowhere. Something is wrong.";
		case "unknown-place":
			return `You don't know of a place called "${fact.input}". ${exitsText(fact.from, fact.exits)}`;
		case "not-discovered":
			return `You haven't found a way to ${fact.place} yet.`;
		case "unknown-person":
			return `You don't know anyone called "${fact.input}".`;
		case "person-absent":
			return `${fact.npc} is not here right now.`;
		case "no-curriculum":
			return "No curriculum data available.";
		case "no-class":
			return `There is no ${fact.subject} class right now.`;
		case "class-elsewhere":
			return `The ${fact.subject} class is held in ${fact.room}.`;
		case "already-attended":
			return `You have already attended ${fact.subject} class this ${fact.period}.`;
		case "no-more-lessons":
			return `No more lessons available for ${fact.subject}.`;
		case "unknown-spell":
			return `There is no spell with id "${fact.input}".`;
		case "spell-not-learned":
			return `You haven't learned ${fact.spell} yet.`;
		case "no-item":
			return `You don't have an item with id "${fact.input}".`;
		case "final-year":
			return "You have already completed your final year at school.";
	}
}

export function describeFacts(facts: TurnFact[]): string {
	return facts.map(describeFact).join(" ");
}

/** One short line for the event log the narrator reads. Refusals are not logged. */
export function logLine(fact: TurnFact): string | undefined {
	switch (fact.kind) {
		case "moved":
			return `Moved from ${fact.from.name} to ${fact.to.name}`;
		case "move-blocked":
			return `Failed to move from ${fact.from.name} to ${fact.to.name}`;
		case "conversation":
			return `Talked to ${fact.npc.id}${fact.topic ? ` about ${fact.topic}` : ""} [${fact.result}]`;
		case "studied":
			return `Studied ${fact.subject.id} for ${fact.hours}h`;
		case "attended":
			return `Attended ${fact.subject.id} class - ${fact.lesson.title}`;
		case "practiced":
			return `Practiced ${fact.spell.id} for ${fact.hours}h`;
		case "interacted":
			return `${fact.verb} ${fact.item.id}`;
		case "rested":
			return `Rested for ${fact.hours} hour(s) at ${fact.place.id}`;
		case "year-advanced":
			return `Advanced from Year ${fact.from} to Year ${fact.to}`;
		case "refused":
			return undefined;
	}
}
