import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import {
	GameEffect,
	attributeDelta,
	flagSet,
	lessonAdvanced,
	progressDelta,
	spellLearned,
	spellRevealed,
	subjectKnowledgeTrack,
} from "../../domain/effects/GameEffects";
import { event } from "../../domain/events/GameEvents";
import { LessonDefinition, SubjectType } from "../../domain/quest/Curriculum";
import { activeClass } from "../../domain/quest/Timetable";
import { TurnContext } from "./context";
import { spellRef } from "./refs";
import { done, refusal } from "./results";

type Attend = Extract<InWorldCommand, { type: "ATTEND_CLASS" }>;

export function attendClass({ subjectId }: Attend, ctx: TurnContext) {
	const { state, registry } = ctx;
	const schoolData = registry.getSchoolData();
	if (!schoolData) return refusal({ reason: "no-curriculum" });

	const subject = subjectId as SubjectType;
	const subjectName = schoolData.subjects[subject]?.name || subject;

	// A class happens at its timetabled time and place, once per slot.
	const slot = activeClass(
		registry.getTimetable(state.currentYear),
		state.worldClock.getWeekday(),
		state.worldClock.timeOfDay,
	);
	if (!slot || slot.subject !== subject) {
		return refusal({ reason: "no-class", subject: subjectName });
	}
	if (slot.location !== state.currentLocationId) {
		const room = registry.getLocation(slot.location ?? "")?.displayName ?? slot.location;
		return refusal({ reason: "class-elsewhere", subject: subjectName, room: room ?? "" });
	}
	const attendedFlag = `attended.${subject}.${state.worldClock.getDay()}.${slot.period}`;
	if (state.flags[attendedFlag]) {
		return refusal({ reason: "already-attended", subject: subjectName, period: slot.period });
	}

	const lesson = ctx.curriculum.getCurrentLesson(subject, state.academicState, schoolData);
	if (!lesson) return refusal({ reason: "no-more-lessons", subject: subjectName });

	// Rewards first: a spell's reveal requirements may depend on the new knowledge.
	const effects: GameEffect[] = [
		flagSet(attendedFlag, true, `attended ${subject} class`),
		...rewardEffects(lesson),
	];
	ctx.apply(effects);

	const { revealed, learned, lessonEffects } = rollSpells(lesson, subject, ctx);
	ctx.apply(lessonEffects);
	effects.push(...lessonEffects);

	return done({
		fact: {
			kind: "attended",
			subject: { id: subject, name: subjectName },
			lesson: { id: lesson.id, title: lesson.title, topic: lesson.topic },
			gains: Object.entries(lesson.rewards.subjectKnowledge ?? {}).map(([subj, amount]) => ({
				subject: subj,
				amount: amount as number,
			})),
			revealed: revealed.map((id) => spellRef(registry, id)),
			learned: learned.map((id) => spellRef(registry, id)),
		},
		minutes: 60,
		effects,
		emits: [
			event("LessonAttended", {
				subjectId: subject,
				lessonId: lesson.id,
				lessonTitle: lesson.title,
			}),
			...revealed.map((spellId) => event("SpellRevealed", { spellId, source: "class" as const })),
			...learned.map((spellId) => event("SpellLearned", { spellId, source: "class" })),
		],
	});
}

/** What a lesson gives the player outright: attributes and subject knowledge. */
function rewardEffects(lesson: LessonDefinition): GameEffect[] {
	const effects: GameEffect[] = [];
	for (const attrId of lesson.rewards.attributes ?? []) {
		effects.push(attributeDelta({ [attrId]: 1 }, `lesson:${lesson.id}`));
	}
	for (const [subj, amount] of Object.entries(lesson.rewards.subjectKnowledge ?? {})) {
		effects.push(
			progressDelta(subjectKnowledgeTrack(subj), amount as number, `lesson:${lesson.id}`),
		);
	}
	return effects;
}

/**
 * Rolls each of the lesson's spell opportunities. A hidden spell becomes known
 * of; a lesson that teaches a spell does so even if the player already knew of
 * it, but never re-teaches a learned or mastered one. Reveal comes before
 * learn, and the lesson is marked done.
 */
function rollSpells(lesson: LessonDefinition, subject: SubjectType, ctx: TurnContext) {
	const { state } = ctx;
	const revealed: string[] = [];
	const learned: string[] = [];
	const revealEffects: GameEffect[] = [];
	const learnEffects: GameEffect[] = [];

	for (const opportunity of ctx.curriculum.getLessonSpellOpportunities(lesson)) {
		const before = state.spellbook.getSpellState(opportunity.spellId)?.knowledgeState;
		const roll = ctx.spellReveal.attemptSpellReveal(
			opportunity,
			state.academicState,
			state.spellbook,
			ctx.random,
		);
		if (!roll.success) continue;

		if (before === "hidden" && !revealed.includes(opportunity.spellId)) {
			revealed.push(opportunity.spellId);
			revealEffects.push(spellRevealed(opportunity.spellId, state.worldClock.getTotalMinutes()));
		}
		if (opportunity.grants === "learned" && (before === "hidden" || before === "available")) {
			learned.push(opportunity.spellId);
			learnEffects.push(spellLearned(opportunity.spellId, "class", `lesson:${lesson.id}`));
		}
	}

	return {
		revealed,
		learned,
		lessonEffects: [
			...revealEffects,
			...learnEffects,
			lessonAdvanced(subject, lesson.id, true),
		],
	};
}
