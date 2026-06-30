import { Command } from "../../ui/cli/commands/Command";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { TurnResult } from "./TurnResult";
import { TimeCost } from "./TimeCost";
import { CurriculumService } from "../domain/quest/CurriculumService";
import { SpellRevealService } from "../domain/magic/SpellRevealService";
import { applySpellUse } from "../domain/magic/SpellProgressionService";
import { SubjectType } from "../domain/quest/Curriculum";
import { GameBus } from "../domain/events/GameEvents";

class TurnResolver {
	private curriculumService: CurriculumService;
	private spellRevealService: SpellRevealService;

	constructor(private bus: GameBus) {
		this.curriculumService = new CurriculumService();
		this.spellRevealService = new SpellRevealService();
	}

	apply(command: Command, state: GameState, registry: Registry): TurnResult {
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
			case "SAVE":
				return this._save(command.filename);
			case "LOAD":
				return this._load(command.filename);
			case "ADVANCE_YEAR":
				// Handled directly by GameEngine.handleCommand (requires async LLM
				// generation); this branch only guards against direct misuse.
				return {
					briefOutput: "",
					events: [],
					timeCost: { type: "none" },
					stateChanges: {},
				};
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
				stateChanges: {},
			};
		}

		if (!registry.getLocation(destinationId)) {
			return {
				briefOutput: `There is no "${destinationId}" here.`,
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		const destination = registry.getLocation(destinationId);
		const destinationDisplayName =
			destination?.displayName ?? destinationId;
		const isNew = !state.discoveredLocationIds.includes(destinationId);

		if (!current.connectedLocationsIds.includes(destinationId)) {
			return {
				briefOutput: `You can't move to ${destinationDisplayName} from ${current.displayName}.`,
				events: [
					`Failed to move from ${current.displayName} to ${destinationDisplayName}`,
				],
				timeCost: { type: "minutes", amount: 2 },
				stateChanges: {},
			};
		}

		this.bus.emit("LocationVisited", {
			locationId: destinationId,
			isFirstVisit: isNew,
		});
		if (isNew) {
			this.bus.emit("LocationDiscovered", { locationId: destinationId });
		}

		return {
			briefOutput: `You traveled to ${destinationDisplayName}.`,
			events: [
				`Moved from ${current.displayName} to ${destinationDisplayName}`,
			],
			timeCost: { type: "minutes", amount: 5 },
			stateChanges: {
				currentLocationId: destinationId,
				newDiscoveredLocationId: isNew ? destinationId : undefined,
			},
		};
	}

	private _talk(
		npcId: string,
		topic: string | undefined,
		state: GameState,
		registry: Registry,
	): TurnResult {
		// Note: Removed the check for known NPCs to allow talking to any NPC, even if not known yet.
		// if (!state.knownNPCIds.includes(npcId)) {
		// 	return {
		// 		briefOutput: `You don't know anyone with id "${npcId}" here.`,
		// 		events: [],
		// 		timeCost: { type: "none" },
		// 		stateChanges: {},
		// 	};
		// }

		const npc = registry.getNPC(npcId);
		const npcName = npc?.name ?? npcId;
		const topicSuffix = topic ? ` about ${topic}` : "";

		this.bus.emit("NpcTalkedTo", { npcId, topic });

		return {
			briefOutput: `You talked to ${npcName}${topicSuffix}. They seem interested in what you have to say.`,
			events: [`Talked to ${npcId}`],
			timeCost: { type: "minutes", amount: 15 },
			stateChanges: {},
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
				stateChanges: {},
			};
		}

		const knowledgeGain = 10 * duration;
		const subject: SubjectType = subjectId as SubjectType;

		this.curriculumService.addSubjectKnowledge(
			subject,
			knowledgeGain,
			state.academicState,
		);

		const revealed = this.spellRevealService.updateSpellAvailability(
			registry,
			state.spellbook,
			state.academicState,
			state.worldClock.getMinutesOfDay(),
		);

		const subjectName = schoolData.subjects[subject]?.name || subject;
		let output = `You studied ${subjectName}. Gained +${knowledgeGain} knowledge.`;

		this.bus.emit("SubjectStudied", {
			subjectId: subject,
			knowledgeGain,
			totalKnowledge:
				state.academicState.subjects[subject]?.knowledge ?? 0,
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
			stateChanges: {
				subjectKnowledgeGains: { [subject]: knowledgeGain } as Partial<
					Record<SubjectType, number>
				>,
				spellsRevealed: revealed,
			},
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
				stateChanges: {},
			};
		}

		const subject: SubjectType = subjectId as SubjectType;
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
				stateChanges: {},
			};
		}

		this.curriculumService.applyLessonRewards(lesson, state.academicState);

		const spellOpportunities =
			this.curriculumService.getLessonSpellOpportunities(lesson);
		const revealedSpells: string[] = [];

		for (const opportunity of spellOpportunities) {
			const result = this.spellRevealService.attemptSpellReveal(
				opportunity,
				state.academicState,
				state.spellbook,
				state.worldClock.getMinutesOfDay(),
			);

			if (result.success) {
				revealedSpells.push(opportunity.spellId);
			}
		}

		this.curriculumService.advanceLesson(
			subject,
			state.academicState,
			lesson.id,
			true,
		);

		this.bus.emit("LessonAttended", {
			subjectId: subject,
			lessonId: lesson.id,
			lessonTitle: lesson.title,
		});

		if (lesson.rewards.attributes) {
			for (const attrId of lesson.rewards.attributes) {
				this.bus.emit("AttributeGained", {
					attributeId: attrId,
					delta: 1,
					newValue: state.academicState.attributes[attrId],
				});
			}
		}

		for (const spellId of revealedSpells) {
			this.bus.emit("SpellRevealed", { spellId, source: "class" });
		}

		const subjectName = schoolData.subjects[subject]?.name || subject;
		let output = `Attended ${subjectName}: "${lesson.title}". ${lesson.topic}.`;

		if (lesson.rewards.subjectKnowledge) {
			const knowledgeGains = Object.entries(
				lesson.rewards.subjectKnowledge,
			)
				.map(([subj, amt]) => `+${amt} ${subj}`)
				.join(", ");
			output += ` Knowledge: ${knowledgeGains}.`;
		}

		if (revealedSpells.length > 0) {
			const spellNames = revealedSpells
				.map((id) => {
					const spell = registry.getSpell(id);
					return spell?.definition.name || id;
				})
				.join(", ");
			output += ` New spells available: ${spellNames}!`;
		}

		return {
			briefOutput: output,
			events: [`Attended ${subject} class - ${lesson.title}`],
			timeCost: { type: "minutes", amount: 60 },
			stateChanges: {
				subjectKnowledgeGains: lesson.rewards
					.subjectKnowledge as Partial<Record<SubjectType, number>>,
				spellsRevealed: revealedSpells,
				lessonCompleted: {
					subject: subjectId as SubjectType,
					lessonId: lesson.id,
				},
			},
		};
	}

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
				stateChanges: {},
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
				stateChanges: {},
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

		state.spellbook.setSpellState(spellId, updatedState);

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
			stateChanges: {},
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
				stateChanges: {},
			};
		}

		return {
			briefOutput: `You ${actionType} ${item.name}. Something happened!`,
			events: [`${actionType} ${itemId}`],
			timeCost: { type: "minutes", amount: 10 },
			stateChanges: {},
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
			stateChanges: {},
		};
	}

	private _save(filename: string): TurnResult {
		this.bus.emit("GameSaved", { filename });
		return {
			briefOutput: `Game saved as '${filename}'.`,
			events: [`Game saved as ${filename}`],
			timeCost: { type: "none" },
			stateChanges: {},
		};
	}

	private _load(filename: string): TurnResult {
		this.bus.emit("GameLoaded", { filename });
		return {
			briefOutput: `Loaded game from '${filename}'.`,
			events: [`Loaded game from ${filename}`],
			timeCost: { type: "none" },
			stateChanges: {},
		};
	}
}

export default TurnResolver;
