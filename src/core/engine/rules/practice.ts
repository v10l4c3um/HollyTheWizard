import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { spellStateUpdated } from "../../domain/effects/GameEffects";
import { event } from "../../domain/events/GameEvents";
import { applySpellUse } from "../../domain/magic/SpellProgressionService";
import { TurnContext } from "./context";
import { done, refusal } from "./results";

type Practice = Extract<InWorldCommand, { type: "PRACTICE" }>;

const ATTEMPTS_PER_HOUR = 10;

export function practice({ spellId, duration: hours }: Practice, ctx: TurnContext) {
	const { state, registry } = ctx;
	const duration = hours ?? 1;
	const spell = registry.getSpell(spellId);
	if (!spell) return refusal({ reason: "unknown-spell", input: spellId });

	const before = state.spellbook.getSpellState(spellId);
	if (!before || (before.knowledgeState !== "learned" && before.knowledgeState !== "mastered")) {
		return refusal({ reason: "spell-not-learned", spell: spell.definition.name });
	}

	const attempts = ATTEMPTS_PER_HOUR * duration;
	let successes = 0;
	let after = before;
	for (let i = 0; i < attempts; i++) {
		const chance = Math.min(0.3 + (after.proficiency / 100) * 0.6, 0.95);
		const success = ctx.random.next() < chance;
		if (success) successes++;
		after = applySpellUse(after, { success }, spell.balance);
	}

	const effects = [spellStateUpdated(spellId, after)];
	ctx.apply(effects);

	const emits = [
		event("SpellPracticed", {
			spellId,
			attempts,
			successCount: successes,
			proficiency: after.proficiency,
		}),
	];
	// Mastery is announced only on the actual transition.
	const mastered = after.knowledgeState === "mastered" && before.knowledgeState !== "mastered";
	if (mastered) {
		emits.push(event("SpellMastered", { spellId }));
	}

	return done({
		fact: {
			kind: "practiced",
			spell: { id: spellId, name: spell.definition.name },
			hours: duration,
			attempts,
			successes,
			proficiency: after.proficiency,
			tier: after.masteryTier,
			mastered,
		},
		minutes: 60 * duration,
		effects,
		emits,
	});
}
