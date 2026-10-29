import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import {
	GameEffect,
	progressDelta,
	spellRevealed,
	subjectKnowledgeTrack,
} from "../../domain/effects/GameEffects";
import { event } from "../../domain/events/GameEvents";
import { SubjectType } from "../../domain/quest/Curriculum";
import { TurnContext } from "./context";
import { done, refusal } from "./results";

type Study = Extract<InWorldCommand, { type: "STUDY" }>;

export function study(command: Study, ctx: TurnContext) {
	const { state, registry } = ctx;
	const schoolData = registry.getSchoolData();
	if (!schoolData) return refusal("No curriculum data available.");

	const duration = command.duration ?? 1;
	const subject = command.subjectId as SubjectType;
	const knowledgeGain = 10 * duration;

	const effects: GameEffect[] = [
		progressDelta(subjectKnowledgeTrack(subject), knowledgeGain, "study"),
	];
	ctx.apply(effects);

	const revealed = ctx.spellReveal.findRevealableSpells(
		registry,
		state.spellbook,
		state.academicState,
	);
	const revealEffects = revealed.map((id) =>
		spellRevealed(id, state.worldClock.getTotalMinutes()),
	);
	ctx.apply(revealEffects);
	effects.push(...revealEffects);

	let briefOutput = `You studied ${schoolData.subjects[subject]?.name || subject}. Gained +${knowledgeGain} knowledge.`;
	if (revealed.length > 0) {
		const names = revealed
			.map((id) => registry.getSpell(id)?.definition.name || id)
			.join(", ");
		briefOutput += ` New spells available: ${names}!`;
	}

	return done({
		briefOutput,
		events: [`Studied ${subject} for ${duration}h`],
		minutes: 60 * duration,
		effects,
		emits: [
			// The event carries the delta only; totals live in the state.
			event("SubjectStudied", { subjectId: subject, knowledgeGain }),
			...revealed.map((spellId) => event("SpellRevealed", { spellId, source: "study" as const })),
		],
	});
}
