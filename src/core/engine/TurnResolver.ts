import { InWorldCommand } from "../domain/commands/CommandDefinitions";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { TurnResult } from "./TurnResult";
import { TimeCost } from "./TimeCost";
import { CurriculumService } from "../domain/quest/CurriculumService";
import { SpellRevealService } from "../domain/magic/SpellRevealService";
import { applySpellUse } from "../domain/magic/SpellProgressionService";
import { SubjectType } from "../domain/quest/Curriculum";
import { Logger, silentLogger } from "../application/ports/Logger";
import { GameBus } from "../domain/events/GameEvents";
import { applyEffects } from "../domain/effects/EffectApplier";
import {
	GameEffect,
	progressDelta,
	attributeDelta,
	flagSet,
	spellLearned,
	spellRevealed,
	spellStateUpdated,
	lessonAdvanced,
	timeAdvanced,
	eventsRecorded,
	subjectKnowledgeTrack,
} from "../domain/effects/GameEffects";
import {
	evaluateConversation,
	ConversationContext,
	ConversationResult,
} from "../domain/npc/Conversation";
import { resolveTopic } from "../domain/npc/TopicRegistry";
import { momentOf, npcLocation } from "../domain/npc/Presence";
import { activeClass } from "../domain/quest/Timetable";
import { arrivalEffects, undiscoveredExits } from "../domain/world/Exploration";

class TurnResolver {
	private curriculumService: CurriculumService;
	private spellRevealService: SpellRevealService;

	constructor(
		private bus: GameBus,
		private logger: Logger = silentLogger,
	) {
		this.curriculumService = new CurriculumService();
		this.spellRevealService = new SpellRevealService();
	}

	apply(command: InWorldCommand, state: GameState, registry: Registry): TurnResult {
		const result = this._dispatch(command, state, registry);

		// Bookkeeping common to every turn: the log, the clock.
		const bookkeeping: GameEffect[] = [];
		if (result.events.length > 0) {
			bookkeeping.push(eventsRecorded(result.events));
		}
		if (result.timeCost.type === "minutes") {
			const beforeTimeOfDay = state.worldClock.timeOfDay;
			bookkeeping.push(timeAdvanced(result.timeCost.amount));
			applyEffects(state, bookkeeping, this.bus, this.logger);
			result.timePassed = {
				minutes: result.timeCost.amount,
				beforeTimeOfDay,
				afterTimeOfDay: state.worldClock.timeOfDay,
			};
		} else {
			applyEffects(state, bookkeeping, this.bus, this.logger);
		}
		result.effects = [...(result.effects ?? []), ...bookkeeping];

		// Generic "something happened" hook for cross-cutting systems (rumors,
		// suspicion, achievements, ...): the rule says how the action turned out.
		this.bus.emit("ActionResolved", {
			actionType: command.type,
			locationId: state.currentLocationId,
			outcome: result.outcome,
		});

		return result;
	}

	private _dispatch(
		command: InWorldCommand,
		state: GameState,
		registry: Registry,
	): TurnResult {
		switch (command.type) {
			case "MOVE":
				return this._move(command.destinationId, state, registry);
			case "TALK":
				return this._talk(
					command.npcId,
					command.conversationTopic,
					state,
					registry,
				);
			case "STUDY":
				return this._study(
					command.subjectId,
					command.duration ?? 1,
					state,
					registry,
				);
			case "ATTEND_CLASS":
				return this._attendClass(
					command.subjectId,
					command.duration ?? 1,
					state,
					registry,
				);
			case "PRACTICE":
				return this._practice(
					command.spellId,
					command.duration ?? 1,
					state,
					registry,
				);
			case "INTERACT":
				return this._interact(
					command.itemId,
					command.actionType,
					state,
				);
			case "REST":
				return this._rest(
					command.duration,
					command.locationId,
					state,
					registry,
				);
		}
	}

	private _move(
		destinationId: string,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const current = registry.getLocation(state.currentLocationId);
		if (!current) {
			return {
				briefOutput: "You seem to be nowhere. Something is wrong.",
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		const whereToGo = this._whereToGo(current, state, registry);

		if (!registry.getLocation(destinationId)) {
			return {
				briefOutput: `You don't know of a place called "${destinationId}". ${whereToGo}`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		const destination = registry.getLocation(destinationId);
		const destinationDisplayName =
			destination?.displayName ?? destinationId;
		const isFirstVisit = !state.visitedLocationIds.includes(destinationId);

		if (!current.connectedLocationsIds.includes(destinationId)) {
			return {
				briefOutput: `You can't move to ${destinationDisplayName} from ${current.displayName}. ${whereToGo}`,
				events: [
					`Failed to move from ${current.displayName} to ${destinationDisplayName}`,
				],
				timeCost: { type: "minutes", amount: 2 },
				outcome: "blocked",
			};
		}

		if (!state.discoveredLocationIds.includes(destinationId)) {
			return {
				briefOutput: `You haven't found a way to ${destinationDisplayName} yet.`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		// Arriving shows you the exits of the new place.
		const seen = undiscoveredExits(registry, state, destinationId);
		const moveEffects = arrivalEffects(registry, state, destinationId);
		applyEffects(state, moveEffects, this.bus, this.logger);

		this.bus.emit("LocationVisited", {
			locationId: destinationId,
			isFirstVisit,
		});
		for (const locationId of seen) {
			this.bus.emit("LocationDiscovered", { locationId });
		}

		return {
			briefOutput: `You traveled to ${destinationDisplayName}.`,
			events: [
				`Moved from ${current.displayName} to ${destinationDisplayName}`,
			],
			timeCost: { type: "minutes", amount: 5 },
			outcome: "success",
			effects: moveEffects,
		};
	}

	/** "From the Hall you can go to: A, B." Only places the player has found. */
	private _whereToGo(
		current: { displayName: string; connectedLocationsIds: string[] },
		state: GameState,
		registry: Registry,
	): string {
		const names = current.connectedLocationsIds
			.filter((id) => state.discoveredLocationIds.includes(id))
			.map((id) => registry.getLocation(id)?.displayName ?? id);
		return names.length > 0
			? `From ${current.displayName} you can go to: ${names.join(", ")}.`
			: `There is nowhere to go from ${current.displayName} yet.`;
	}

	private _talk(
		npcId: string,
		topic: string | undefined,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const npc = registry.getNPC(npcId);
		if (!npc) {
			return {
				briefOutput: `You don't know anyone called "${npcId}".`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}
		if (npcLocation(npc, momentOf(state, registry)) !== state.currentLocationId) {
			return {
				briefOutput: `${npc.name} is not here right now.`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}
		const npcName = npc.name;

		const relationship = state.relationships[npcId];
		// First contact: no relationship record yet — evaluator treats as zeroed stats.

		const locationId = state.currentLocationId;
		const topicDef = resolveTopic(topic);
		const npcProfile = registry.getNpcProfile(npcId);
		const recentHistory = state.conversationHistory[npcId] ?? [];
		// Take the last 10 global event strings for mood-modifier phase
		const recentEvents = state.recentEvents.slice(-10);
		const turnIndex = state.worldClock.getTotalMinutes();

		const ctx: ConversationContext = {
			npcId,
			topic,
			topicDef,
			npcProfile,
			isPrivate: isPrivateLocation(locationId),
			locationId,
			relationship: relationship ?? {
				trust: 0,
				affection: 0,
				respect: 0,
				comfort: 0,
				attraction: 0,
				loyalty: 0,
				resentment: 0,
				fear: 0,
				envy: 0,
				applyDelta: () => {},
			},
			flags: state.flags,
			recentHistory,
			recentEvents,
			turnIndex,
		};

		const outcome = evaluateConversation(ctx);
		applyEffects(state, outcome.effects, this.bus, this.logger);

		this.bus.emit("NpcTalkedTo", { npcId, topic });
		this.bus.emit("ConversationResolved", {
			npcId,
			topic,
			result: outcome.result,
			narrationTags: outcome.narrationTags ?? [],
			score: outcome.score,
		});
		this.bus.emit("TopicDiscussed", {
			npcId,
			topicId: topic ?? "general",
			category: topicDef.category,
		});
		if (outcome.result === "refusal" && npcProfile?.hardBoundaries.includes(topic ?? "")) {
			this.bus.emit("BoundaryHit", { npcId, topicId: topic ?? "general" });
		}
		if (outcome.result === "reveal" || outcome.result === "invitation") {
			this.bus.emit("RevealTriggered", { npcId, topicId: topic ?? "general" });
		}

		const topicSuffix = topic ? ` about ${topic}` : "";
		const briefOutput = buildConversationOutput(npcName, topicSuffix, outcome.result);

		return {
			briefOutput,
			events: [`Talked to ${npcId}${topicSuffix} [${outcome.result}]`],
			timeCost: { type: "minutes", amount: 15 },
			outcome: "success",
			effects: outcome.effects,
		};
	}

	private _study(
		subjectId: string,
		duration: number,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const schoolData = registry.getSchoolData();
		if (!schoolData) {
			return {
				briefOutput: "No curriculum data available.",
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		const knowledgeGain = 10 * duration;
		const subject: SubjectType = subjectId as SubjectType;

		// Cause event carries the delta only (no totals); the actual state
		// mutation happens via `ProgressDelta` through `applyEffects` (Steps
		// 2 & 7 of the conversion plan).
		const effects: GameEffect[] = [
			progressDelta(
				subjectKnowledgeTrack(subject),
				knowledgeGain,
				"study",
			),
		];
		applyEffects(state, effects, this.bus, this.logger);

		const revealed = this.spellRevealService.findRevealableSpells(
			registry,
			state.spellbook,
			state.academicState,
		);
		const revealEffects = revealed.map((id) =>
			spellRevealed(id, state.worldClock.getTotalMinutes()),
		);
		applyEffects(state, revealEffects, this.bus, this.logger);
		effects.push(...revealEffects);

		const subjectName = schoolData.subjects[subject]?.name || subject;
		let output = `You studied ${subjectName}. Gained +${knowledgeGain} knowledge.`;

		this.bus.emit("SubjectStudied", {
			subjectId: subject,
			knowledgeGain,
		});

		for (const spellId of revealed) {
			this.bus.emit("SpellRevealed", { spellId, source: "study" });
		}

		if (revealed.length > 0) {
			const spellNames = revealed
				.map((id) => {
					const spell = registry.getSpell(id);
					return spell?.definition.name || id;
				})
				.join(", ");
			output += ` New spells available: ${spellNames}!`;
		}

		return {
			briefOutput: output,
			events: [`Studied ${subject} for ${duration}h`],
			timeCost: { type: "minutes", amount: 60 * duration },
			outcome: "success",
			effects,
		};
	}

	private _attendClass(
		subjectId: string,
		duration: number,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const schoolData = registry.getSchoolData();
		if (!schoolData) {
			return {
				briefOutput: "No curriculum data available.",
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		const subject: SubjectType = subjectId as SubjectType;
		const subjectLabel = schoolData.subjects[subject]?.name || subject;

		// A class happens at its timetabled time and place, once per slot.
		const slot = activeClass(
			registry.getTimetable(state.currentYear),
			state.worldClock.getWeekday(),
			state.worldClock.timeOfDay,
		);
		const refuse = (briefOutput: string): TurnResult => ({
			briefOutput,
			events: [],
			timeCost: { type: "none" },
			outcome: "failure",
		});
		if (!slot || slot.subject !== subject) {
			return refuse(`There is no ${subjectLabel} class right now.`);
		}
		if (slot.location !== state.currentLocationId) {
			const room = registry.getLocation(slot.location ?? "")?.displayName ?? slot.location;
			return refuse(`The ${subjectLabel} class is held in ${room}.`);
		}
		const attendedFlag = `attended.${subject}.${state.worldClock.getDay()}.${slot.period}`;
		if (state.flags[attendedFlag]) {
			return refuse(`You have already attended ${subjectLabel} class this ${slot.period}.`);
		}

		const lesson = this.curriculumService.getCurrentLesson(
			subject,
			state.academicState,
			schoolData,
		);

		if (!lesson) {
			const subjectName = schoolData.subjects[subject]?.name || subject;
			return {
				briefOutput: `No more lessons available for ${subjectName}.`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		// Lesson rewards become effects instead of being mutated directly and
		// re-announced as `AttributeGained` events (Steps 2 & 4B of the
		// conversion plan). Applied before spell-reveal checks below, since
		// reveal requirements may depend on the updated attributes/knowledge.
		const effects: GameEffect[] = [
			flagSet(attendedFlag, true, `attended ${subject} class`),
		];
		if (lesson.rewards.attributes) {
			for (const attrId of lesson.rewards.attributes) {
				effects.push(
					attributeDelta({ [attrId]: 1 }, `lesson:${lesson.id}`),
				);
			}
		}
		if (lesson.rewards.subjectKnowledge) {
			for (const [subj, amount] of Object.entries(
				lesson.rewards.subjectKnowledge,
			)) {
				effects.push(
					progressDelta(
						subjectKnowledgeTrack(subj),
						amount as number,
						`lesson:${lesson.id}`,
					),
				);
			}
		}
		applyEffects(state, effects, this.bus, this.logger);

		const spellOpportunities =
			this.curriculumService.getLessonSpellOpportunities(lesson);
		const revealedSpells: string[] = [];
		const learnedSpells: string[] = [];
		const learnEffects: GameEffect[] = [];
		const revealEffects: GameEffect[] = [];

		for (const opportunity of spellOpportunities) {
			const before = state.spellbook.getSpellState(
				opportunity.spellId,
			)?.knowledgeState;
			const result = this.spellRevealService.attemptSpellReveal(
				opportunity,
				state.academicState,
				state.spellbook,
			);

			if (!result.success) continue;

			if (before === "hidden" && !revealedSpells.includes(opportunity.spellId)) {
				revealedSpells.push(opportunity.spellId);
				revealEffects.push(
					spellRevealed(
						opportunity.spellId,
						state.worldClock.getTotalMinutes(),
					),
				);
			}
			// A lesson that teaches the spell does so even if the player
			// already knew of it; it never re-teaches a learned/mastered one.
			if (
				opportunity.grants === "learned" &&
				(before === "hidden" || before === "available")
			) {
				learnedSpells.push(opportunity.spellId);
				learnEffects.push(
					spellLearned(
						opportunity.spellId,
						"class",
						`lesson:${lesson.id}`,
					),
				);
			}
		}
		// Reveal first: only an available spell can be taught.
		const lessonEffects = [
			...revealEffects,
			...learnEffects,
			lessonAdvanced(subject, lesson.id, true),
		];
		applyEffects(state, lessonEffects, this.bus, this.logger);
		effects.push(...lessonEffects);

		this.bus.emit("LessonAttended", {
			subjectId: subject,
			lessonId: lesson.id,
			lessonTitle: lesson.title,
		});

		for (const spellId of revealedSpells) {
			this.bus.emit("SpellRevealed", { spellId, source: "class" });
		}
		for (const spellId of learnedSpells) {
			this.bus.emit("SpellLearned", { spellId, source: "class" });
		}

		const subjectName = subjectLabel;
		let output = `Attended ${subjectName}: "${lesson.title}". ${lesson.topic}.`;

		if (lesson.rewards.subjectKnowledge) {
			const knowledgeGains = Object.entries(
				lesson.rewards.subjectKnowledge,
			)
				.map(([subj, amt]) => `+${amt} ${subj}`)
				.join(", ");
			output += ` Knowledge: ${knowledgeGains}.`;
		}

		const spellNameList = (ids: string[]) =>
			ids
				.map((id) => registry.getSpell(id)?.definition.name || id)
				.join(", ");
		const onlyKnownOf = revealedSpells.filter(
			(id) => !learnedSpells.includes(id),
		);
		if (learnedSpells.length > 0) {
			output += ` Learned: ${spellNameList(learnedSpells)}!`;
		}
		if (onlyKnownOf.length > 0) {
			output += ` New spells available: ${spellNameList(onlyKnownOf)}!`;
		}

		return {
			briefOutput: output,
			events: [`Attended ${subject} class - ${lesson.title}`],
			timeCost: { type: "minutes", amount: 60 },
			outcome: "success",
			effects,
		};
	}

	/**
	 * Not yet converted to the effect model: spell proficiency updates
	 * (practice points, reliability, mastery tier, diminishing returns) are
	 * not a plain delta, so this keeps mutating `SpellBook` directly via
	 * `SpellProgressionService` for now. `SpellMastered` is still derived
	 * from an actual state transition rather than emitted unconditionally.
	 * See docs/event-effect-conversion-plan.md, Step 9.
	 */
	private _practice(
		spellId: string,
		duration: number,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const spellState = state.spellbook.getSpellState(spellId);
		const spell = registry.getSpell(spellId);

		if (!spell) {
			return {
				briefOutput: `There is no spell with id "${spellId}".`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		if (
			!spellState ||
			(spellState.knowledgeState !== "learned" &&
				spellState.knowledgeState !== "mastered")
		) {
			return {
				briefOutput: `You haven't learned ${spell.definition.name} yet.`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		const attemptsPerHour = 10;
		const totalAttempts = attemptsPerHour * duration;
		let successCount = 0;
		let updatedState = spellState;

		for (let i = 0; i < totalAttempts; i++) {
			const successChance = Math.min(
				0.3 + (updatedState.proficiency / 100) * 0.6,
				0.95,
			);
			const success = Math.random() < successChance;
			if (success) successCount++;

			updatedState = applySpellUse(
				updatedState,
				{ success },
				spell.balance,
			);
		}

		const practiceEffects = [spellStateUpdated(spellId, updatedState)];
		applyEffects(state, practiceEffects, this.bus, this.logger);

		this.bus.emit("SpellPracticed", {
			spellId,
			attempts: totalAttempts,
			successCount,
			proficiency: updatedState.proficiency,
		});

		if (
			updatedState.knowledgeState === "mastered" &&
			spellState.knowledgeState !== "mastered"
		) {
			this.bus.emit("SpellMastered", { spellId });
		}

		const proficiencyGain =
			updatedState.proficiency - spellState.proficiency;
		const masteryTierName =
			updatedState.masteryTier.charAt(0).toUpperCase() +
			updatedState.masteryTier.slice(1);

		return {
			briefOutput: `You practiced ${spell.definition.name} ${totalAttempts} times. Success: ${successCount}/${totalAttempts}. Proficiency: ${Math.round(updatedState.proficiency)}/100 (${masteryTierName}).`,
			events: [`Practiced ${spellId} for ${duration}h`],
			timeCost: { type: "minutes", amount: 60 * duration },
			outcome: "success",
			effects: practiceEffects,
		};
	}

	private _interact(
		itemId: string,
		actionType: string,
		state: GameState,
	): TurnResult {
		const item = state.inventory.items.find((i) => i.id === itemId);
		if (!item) {
			return {
				briefOutput: `You don't have an item with id "${itemId}".`,
				events: [],
				timeCost: { type: "none" },
				outcome: "failure",
			};
		}

		return {
			briefOutput: `You ${actionType} ${item.name}. Something happened!`,
			events: [`${actionType} ${itemId}`],
			timeCost: { type: "minutes", amount: 10 },
			outcome: "success",
		};
	}

	private _rest(
		duration: number,
		locationId: string | undefined,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const locId = locationId ?? state.currentLocationId;
		const location = registry.getLocation(locId);
		const locName = location?.displayName ?? locId;

		return {
			briefOutput: `You rested for ${duration} hour(s) at ${locName}. You feel refreshed!`,
			events: [`Rested for ${duration} hour(s) at ${locId}`],
			timeCost: { type: "minutes", amount: 60 * duration },
			outcome: "success",
		};
	}

}

export default TurnResolver;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIVATE_LOCATION_KEYWORDS = [
	"dormitory",
	"room",
	"private",
	"study",
	"quarters",
	"office",
	"garden",
];

function isPrivateLocation(locationId: string): boolean {
	const lower = locationId.toLowerCase();
	return PRIVATE_LOCATION_KEYWORDS.some((kw) => lower.includes(kw));
}

function buildConversationOutput(
	npcName: string,
	topicSuffix: string,
	result: ConversationResult,
): string {
	switch (result) {
		case "success":
			return `You had a pleasant conversation with ${npcName}${topicSuffix}.`;
		case "partial":
			return `${npcName} answered cautiously${topicSuffix}. You learned something, though not everything.`;
		case "refusal":
			return `${npcName} refused to engage${topicSuffix}. The conversation ended poorly.`;
		case "deflection":
			return `${npcName} deflected your question${topicSuffix} with practiced ease.`;
		case "reveal":
			return `${npcName} opened up${topicSuffix}. You learned something significant.`;
		case "invitation":
			return `${npcName} suggested meeting again${topicSuffix}. An invitation has been extended.`;
	}
}
