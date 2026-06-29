import SpellBook from "./SpellBook";
import Registry from "../../Registry";
import { PlayerAcademicState, Requirement, SpellRevealOpportunity, SchoolData } from "../quest/Curriculum";
import { SpellDefinition } from "./Spell";
import { createLearnedSpellState } from "./SpellStateFactory";

export class SpellRevealService {
	updateSpellAvailability(
		registry: Registry,
		spellbook: SpellBook,
		academicState: PlayerAcademicState,
		currentTime?: number
	): string[] {
		const revealed: string[] = [];
		const allSpells = spellbook.getAllSpells();

		for (const spellState of allSpells) {
			if (spellState.knowledgeState === "hidden") {
				const spell = registry.getSpell(spellState.spellId);
				if (spell && spell.definition.revealCondition) {
					const meetsCondition = this.checkRevealCondition(
						spell.definition.revealCondition,
						academicState
					);

					if (meetsCondition) {
						spellbook.updateSpellState(spellState.spellId, {
							knowledgeState: "available",
							becameAvailableAt: currentTime
						});
						revealed.push(spellState.spellId);
					}
				}
			}
		}

		return revealed;
	}

	private checkRevealCondition(
		condition: { type: string; value: string | number; source?: string },
		academicState: PlayerAcademicState
	): boolean {
		return false;
	}

	checkRequirements(
		requirements: Requirement[],
		academicState: PlayerAcademicState,
		spellbook: SpellBook
	): boolean {
		for (const req of requirements) {
			switch (req.type) {
				case "attribute":
					if (academicState.attributes[req.id] < req.min) {
						return false;
					}
					break;
				case "subjectKnowledge":
					const subject = academicState.subjects[req.subjectId];
					if (!subject || subject.knowledge < req.min) {
						return false;
					}
					break;
				case "year":
					const currentYear = Object.values(academicState.subjects)[0]?.year || 1;
					if (currentYear < req.min) {
						return false;
					}
					break;
				case "spellKnown":
					if (!spellbook.hasLearnedSpell(req.spellId)) {
						return false;
					}
					break;
			}
		}
		return true;
	}

	attemptSpellReveal(
		opportunity: SpellRevealOpportunity,
		academicState: PlayerAcademicState,
		spellbook: SpellBook,
		currentTime?: number
	): { success: boolean; reason?: string } {
		const meetsRequirements = this.checkRequirements(
			opportunity.requirements,
			academicState,
			spellbook
		);

		if (!meetsRequirements) {
			return { success: false, reason: "Requirements not met" };
		}

		const roll = Math.random();
		if (roll <= opportunity.chance) {
			spellbook.updateSpellState(opportunity.spellId, {
				knowledgeState: "available",
				becameAvailableAt: currentTime
			});
			return { success: true };
		}

		return { success: false, reason: "Failed chance roll" };
	}

	learnSpell(
		spellId: string,
		spellbook: SpellBook,
		registry: Registry,
		source: string,
		currentTime?: number
	): { success: boolean; reason?: string } {
		const currentState = spellbook.getSpellState(spellId);
		if (!currentState) {
			return { success: false, reason: "Spell not in spellbook" };
		}

		if (currentState.knowledgeState !== "available") {
			return { success: false, reason: `Spell is ${currentState.knowledgeState}, not available` };
		}

		const spell = registry.getSpell(spellId);
		if (!spell) {
			return { success: false, reason: "Spell not found in registry" };
		}

		spellbook.updateSpellState(spellId, {
			knowledgeState: "learned",
			discoveredFrom: source,
			proficiency: 0,
			practicePoints: 0
		});

		return { success: true };
	}
}
